import * as fs from 'fs';
import * as path from 'path';
import { executeShell } from './shell.ts';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

export interface CodeToolResult {
    success: boolean;
    output?: string;
    error?: string;
    message?: string;
    data?: any;
}

// ─── Install package ──────────────────────────────────────────────────────────

export async function installPackage(
    packageName: string,
    manager: 'npm' | 'pip' | 'pip3' | 'yarn' = 'npm',
    global = false
): Promise<CodeToolResult> {
    let cmd: string;
    switch (manager) {
        case 'pip':
        case 'pip3':
            cmd = `pip3 install ${packageName} --quiet 2>&1`;
            break;
        case 'yarn':
            cmd = `yarn add ${global ? '-g ' : ''}${packageName} 2>&1`;
            break;
        default:
            cmd = `npm install ${global ? '-g ' : ''}${packageName} 2>&1`;
    }

    const r = await executeShell(cmd, 120000);
    return {
        success: r.exit_code === 0,
        output: (r.stdout || '') + (r.stderr || ''),
        message: r.exit_code === 0
            ? `Package "${packageName}" installed via ${manager}`
            : `Failed to install "${packageName}"`,
        error: r.exit_code !== 0 ? r.stderr || r.error : undefined,
    };
}

// ─── Debug code ───────────────────────────────────────────────────────────────

export async function debugCode(
    code: string,
    language: 'python' | 'javascript' | 'typescript' | 'bash' = 'python',
    errorMsg = ''
): Promise<CodeToolResult> {
    const ts = Date.now();
    ensureWorkspace();

    const extMap: Record<string, string> = {
        python: '.py', javascript: '.mjs', typescript: '.ts', bash: '.sh',
    };
    const ext = extMap[language] || '.py';
    const fpath = path.join(WORKSPACE, `_debug_${ts}${ext}`);
    fs.writeFileSync(fpath, code, 'utf8');

    let runCmd: string;
    switch (language) {
        case 'javascript':  runCmd = `node "${fpath}" 2>&1`; break;
        case 'typescript':  runCmd = `npx tsx "${fpath}" 2>&1`; break;
        case 'bash':        runCmd = `bash "${fpath}" 2>&1`; break;
        default:            runCmd = `python3 "${fpath}" 2>&1`; break;
    }

    const r = await executeShell(runCmd, 30000);
    try { fs.unlinkSync(fpath); } catch {}

    const combinedOutput = (r.stdout || '') + (r.stderr || '');
    const hasError = r.exit_code !== 0 || combinedOutput.includes('Error') || combinedOutput.includes('error');

    let analysis = '';
    if (hasError) {
        const errText = errorMsg || combinedOutput;
        // Provide basic analysis based on error patterns
        if (errText.includes('ModuleNotFoundError') || errText.includes('Cannot find module')) {
            analysis = 'ISSUE: Missing dependency. Use install_package to install the required module.';
        } else if (errText.includes('SyntaxError')) {
            analysis = 'ISSUE: Syntax error in the code. Check for missing brackets, colons, or incorrect indentation.';
        } else if (errText.includes('TypeError')) {
            analysis = 'ISSUE: Type error — wrong data type used. Check variable types and function signatures.';
        } else if (errText.includes('AttributeError')) {
            analysis = 'ISSUE: Attribute error — accessing property/method that does not exist on the object.';
        } else if (errText.includes('NameError')) {
            analysis = 'ISSUE: Name error — using variable or function that is not defined.';
        } else if (errText.includes('IndexError') || errText.includes('KeyError')) {
            analysis = 'ISSUE: Index/key out of range — accessing element that does not exist in collection.';
        } else if (errText.includes('PermissionError')) {
            analysis = 'ISSUE: Permission denied — file/directory access restricted.';
        } else if (errText.includes('FileNotFoundError') || errText.includes('ENOENT')) {
            analysis = 'ISSUE: File not found — check the file path exists.';
        } else if (errText.includes('ZeroDivisionError')) {
            analysis = 'ISSUE: Division by zero — add a check before dividing.';
        } else if (errText.includes('RecursionError') || errText.includes('Maximum call stack')) {
            analysis = 'ISSUE: Infinite recursion — check base case in recursive function.';
        } else {
            analysis = 'ISSUE: Runtime error. Check the error message above for details.';
        }
    }

    return {
        success: r.exit_code === 0,
        output: combinedOutput,
        message: r.exit_code === 0 ? 'Code runs without errors' : 'Code has errors',
        data: {
            exit_code: r.exit_code,
            has_error: hasError,
            analysis: hasError ? analysis : 'Code runs successfully',
            language,
        },
    };
}

// ─── Apply patch ──────────────────────────────────────────────────────────────

export async function applyPatch(patchContent: string, targetFile?: string, reverse = false): Promise<CodeToolResult> {
    ensureWorkspace();
    const ts = Date.now();
    const patchFile = path.join(WORKSPACE, `_patch_${ts}.patch`);
    fs.writeFileSync(patchFile, patchContent, 'utf8');

    let cmd: string;
    if (targetFile) {
        const fullTarget = path.isAbsolute(targetFile)
            ? targetFile
            : path.join(WORKSPACE, targetFile);
        cmd = `patch ${reverse ? '-R ' : ''}${JSON.stringify(fullTarget)} < ${JSON.stringify(patchFile)} 2>&1`;
    } else {
        cmd = `patch ${reverse ? '-R ' : ''}-p1 < ${JSON.stringify(patchFile)} 2>&1`;
    }

    const r = await executeShell(cmd, 15000);
    try { fs.unlinkSync(patchFile); } catch {}

    return {
        success: r.exit_code === 0,
        output: (r.stdout || '') + (r.stderr || ''),
        message: r.exit_code === 0 ? 'Patch applied successfully' : 'Patch failed',
        error: r.exit_code !== 0 ? r.stderr : undefined,
    };
}
