import { executeShell } from './shell.ts';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Resolve Python/Node paths from environment
function resolveBin(name: string): string {
    try { return execSync(`which ${name}`, { encoding: 'utf8' }).trim(); } catch { return name; }
}

const PYTHON3 = resolveBin('python3');
const NODE_BIN = resolveBin('node');

export interface CodeResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exit_code: number;
    error?: string;
}

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

export async function executeCode(language: string, code: string, timeoutSec = 30): Promise<CodeResult> {
    ensureWorkspace();
    const lang = language.toLowerCase().trim();
    const ts = Date.now();
    const timeoutMs = timeoutSec * 1000;

    if (lang === 'python' || lang === 'python3' || lang === 'py') {
        const fpath = path.join(WORKSPACE, `_code_${ts}.py`);
        fs.writeFileSync(fpath, code, 'utf8');
        try {
            const r = await executeShell(`cd "${WORKSPACE}" && "${PYTHON3}" "${fpath}"`, timeoutMs);
            return {
                success: r.exit_code === 0,
                stdout: r.stdout || '',
                stderr: r.stderr || '',
                exit_code: r.exit_code ?? -1,
                error: r.error,
            };
        } finally {
            try { fs.unlinkSync(fpath); } catch {}
        }
    }

    if (lang === 'javascript' || lang === 'js' || lang === 'node' || lang === 'nodejs') {
        const fpath = path.join(WORKSPACE, `_code_${ts}.mjs`);
        fs.writeFileSync(fpath, code, 'utf8');
        try {
            const r = await executeShell(`cd "${WORKSPACE}" && "${NODE_BIN}" "${fpath}"`, timeoutMs);
            return {
                success: r.exit_code === 0,
                stdout: r.stdout || '',
                stderr: r.stderr || '',
                exit_code: r.exit_code ?? -1,
                error: r.error,
            };
        } finally {
            try { fs.unlinkSync(fpath); } catch {}
        }
    }

    if (lang === 'typescript' || lang === 'ts') {
        const fpath = path.join(WORKSPACE, `_code_${ts}.ts`);
        fs.writeFileSync(fpath, code, 'utf8');
        try {
            const r = await executeShell(`cd "${WORKSPACE}" && npx tsx "${fpath}" 2>&1`, timeoutMs);
            return {
                success: r.exit_code === 0,
                stdout: r.stdout || '',
                stderr: r.stderr || '',
                exit_code: r.exit_code ?? -1,
                error: r.error,
            };
        } finally {
            try { fs.unlinkSync(fpath); } catch {}
        }
    }

    if (lang === 'bash' || lang === 'shell' || lang === 'sh') {
        const fpath = path.join(WORKSPACE, `_code_${ts}.sh`);
        fs.writeFileSync(fpath, code, 'utf8');
        fs.chmodSync(fpath, 0o755);
        try {
            const r = await executeShell(`cd "${WORKSPACE}" && bash "${fpath}"`, timeoutMs);
            return {
                success: r.exit_code === 0,
                stdout: r.stdout || '',
                stderr: r.stderr || '',
                exit_code: r.exit_code ?? -1,
                error: r.error,
            };
        } finally {
            try { fs.unlinkSync(fpath); } catch {}
        }
    }

    if (lang === 'ruby' || lang === 'rb') {
        const fpath = path.join(WORKSPACE, `_code_${ts}.rb`);
        fs.writeFileSync(fpath, code, 'utf8');
        try {
            const r = await executeShell(`cd "${WORKSPACE}" && ruby "${fpath}"`, timeoutMs);
            return {
                success: r.exit_code === 0,
                stdout: r.stdout || '',
                stderr: r.stderr || '',
                exit_code: r.exit_code ?? -1,
                error: r.error,
            };
        } finally {
            try { fs.unlinkSync(fpath); } catch {}
        }
    }

    return {
        success: false,
        stdout: '',
        stderr: '',
        exit_code: -1,
        error: `Unsupported language: "${lang}". Supported: python, javascript/node, typescript, bash/shell, ruby`,
    };
}
