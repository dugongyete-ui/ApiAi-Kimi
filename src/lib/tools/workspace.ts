import * as fs from 'fs';
import * as path from 'path';
import { executeShell } from './shell.ts';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function resolvePath(p: string, base = WORKSPACE): string {
    const resolved = path.isAbsolute(p) ? p : path.join(base, p);
    return resolved;
}

export interface WorkspaceResult {
    success: boolean;
    path?: string;
    message?: string;
    error?: string;
    data?: any;
}

// ─── Directory operations ─────────────────────────────────────────────────────

export function createDirectory(dirPath: string, recursive = true): WorkspaceResult {
    ensureWorkspace();
    try {
        const full = resolvePath(dirPath);
        fs.mkdirSync(full, { recursive });
        return { success: true, path: full, message: `Directory created: ${dirPath}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function moveFile(srcPath: string, destPath: string): WorkspaceResult {
    ensureWorkspace();
    try {
        const src = resolvePath(srcPath);
        const dest = resolvePath(destPath);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.renameSync(src, dest);
        return { success: true, path: dest, message: `Moved: ${srcPath} → ${destPath}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function copyFile(srcPath: string, destPath: string): WorkspaceResult {
    ensureWorkspace();
    try {
        const src = resolvePath(srcPath);
        const dest = resolvePath(destPath);
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
        return { success: true, path: dest, message: `Copied: ${srcPath} → ${destPath}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── Project management ───────────────────────────────────────────────────────

export function createProject(name: string, template: 'node' | 'python' | 'web' | 'blank' = 'blank'): WorkspaceResult {
    ensureWorkspace();
    try {
        const projectPath = resolvePath(name);
        if (fs.existsSync(projectPath)) {
            return { success: false, error: `Project "${name}" already exists at ${projectPath}` };
        }
        fs.mkdirSync(projectPath, { recursive: true });

        const files: Record<string, string> = {};

        if (template === 'node') {
            files['package.json'] = JSON.stringify({ name, version: '1.0.0', main: 'index.js', scripts: { start: 'node index.js' } }, null, 2);
            files['index.js'] = `// ${name} - Node.js project\nconsole.log('Hello from ${name}!');\n`;
            files['.gitignore'] = 'node_modules/\n.env\n';
            files['README.md'] = `# ${name}\n\nA Node.js project.\n`;
        } else if (template === 'python') {
            files['main.py'] = `# ${name} - Python project\nprint('Hello from ${name}!')\n`;
            files['requirements.txt'] = `# Add your dependencies here\n`;
            files['.gitignore'] = '__pycache__/\n*.pyc\n.env\nvenv/\n';
            files['README.md'] = `# ${name}\n\nA Python project.\n`;
        } else if (template === 'web') {
            files['index.html'] = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>${name}</h1>\n  <script src="script.js"></script>\n</body>\n</html>\n`;
            files['style.css'] = `* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: sans-serif; padding: 2rem; }\n`;
            files['script.js'] = `// ${name} - Frontend JavaScript\nconsole.log('${name} loaded');\n`;
            files['README.md'] = `# ${name}\n\nA web project.\n`;
        } else {
            files['README.md'] = `# ${name}\n\nProject created by agent.\n`;
        }

        for (const [filename, content] of Object.entries(files)) {
            fs.writeFileSync(path.join(projectPath, filename), content, 'utf8');
        }

        return {
            success: true,
            path: projectPath,
            message: `Project "${name}" created (template: ${template}) with ${Object.keys(files).length} files`,
            data: { name, template, files: Object.keys(files), path: projectPath },
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function deleteProject(name: string, confirm = false): WorkspaceResult {
    ensureWorkspace();
    if (!confirm) {
        return { success: false, error: 'Safety check: set confirm=true to delete a project directory' };
    }
    try {
        const projectPath = resolvePath(name);
        if (!fs.existsSync(projectPath)) {
            return { success: false, error: `Project not found: ${name}` };
        }
        fs.rmSync(projectPath, { recursive: true, force: true });
        return { success: true, message: `Project "${name}" deleted` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export function switchWorkspace(dirPath: string): WorkspaceResult {
    try {
        const target = path.isAbsolute(dirPath)
            ? dirPath
            : path.join(WORKSPACE, dirPath);
        if (!fs.existsSync(target)) {
            fs.mkdirSync(target, { recursive: true });
        }
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) return { success: false, error: `Not a directory: ${dirPath}` };
        return {
            success: true,
            path: target,
            message: `Workspace context set to: ${target}`,
            data: { workspace: target, note: 'Use relative paths from this workspace in subsequent tool calls' },
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── Project structure / file search ─────────────────────────────────────────

export async function getProjectStructure(dirPath = '.', maxDepth = 4): Promise<WorkspaceResult> {
    ensureWorkspace();
    const full = resolvePath(dirPath);

    function treeStr(dir: string, depth: number, prefix = ''): string {
        if (depth <= 0) return prefix + '...\n';
        let out = '';
        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch { return ''; }
        entries = entries.filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__');
        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const isLast = i === entries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = isLast ? '    ' : '│   ';
            out += prefix + connector + e.name + (e.isDirectory() ? '/' : '') + '\n';
            if (e.isDirectory()) {
                out += treeStr(path.join(dir, e.name), depth - 1, prefix + childPrefix);
            }
        }
        return out;
    }

    try {
        const tree = treeStr(full, maxDepth);
        return { success: true, path: full, data: tree || '(empty)', message: `Project structure of ${dirPath}` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function searchInFiles(query: string, dirPath = '.', fileGlob = '*'): Promise<WorkspaceResult> {
    ensureWorkspace();
    const full = resolvePath(dirPath);
    const r = await executeShell(
        `grep -rn --include="${fileGlob}" --color=never -i ${JSON.stringify(query)} ${JSON.stringify(full)} 2>/dev/null | head -50`
    );
    if (r.exit_code !== 0 && !r.stdout) {
        return { success: true, data: `No matches found for "${query}" in ${dirPath}` };
    }
    return {
        success: true,
        data: r.stdout || 'No matches.',
        message: `Search results for "${query}" in ${dirPath}`,
    };
}
