import { executeShell } from './shell.ts';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

export interface ArchiveResult {
    success: boolean;
    output?: string;
    files?: string[];
    error?: string;
}

function resolvePath(p: string): string {
    if (path.isAbsolute(p)) return p;
    return path.join(WORKSPACE, p);
}

export async function createZip(archivePath: string, sources: string | string[]): Promise<ArchiveResult> {
    ensureWorkspace();
    const dest = resolvePath(archivePath);
    const srcArr = Array.isArray(sources) ? sources : [sources];
    const resolved = srcArr.map(s => `"${resolvePath(s)}"`).join(' ');
    const r = await executeShell(`zip -r "${dest}" ${resolved}`);
    return { success: r.exit_code === 0, output: (r.stdout + r.stderr).trim(), error: r.error };
}

export async function extractZip(archivePath: string, destDir?: string): Promise<ArchiveResult> {
    ensureWorkspace();
    const src = resolvePath(archivePath);
    const dest = destDir ? resolvePath(destDir) : WORKSPACE;
    const r = await executeShell(`unzip -o "${src}" -d "${dest}"`);
    return { success: r.exit_code === 0, output: (r.stdout + r.stderr).trim(), error: r.error };
}

export async function createTar(archivePath: string, sources: string | string[], compress = true): Promise<ArchiveResult> {
    ensureWorkspace();
    const dest = resolvePath(archivePath);
    const srcArr = Array.isArray(sources) ? sources : [sources];
    const resolved = srcArr.map(s => `"${resolvePath(s)}"`).join(' ');
    const flag = compress ? 'czf' : 'cf';
    const r = await executeShell(`tar -${flag} "${dest}" ${resolved}`);
    return { success: r.exit_code === 0, output: (r.stdout + r.stderr).trim(), error: r.error };
}

export async function extractTar(archivePath: string, destDir?: string): Promise<ArchiveResult> {
    ensureWorkspace();
    const src = resolvePath(archivePath);
    const dest = destDir ? resolvePath(destDir) : WORKSPACE;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const r = await executeShell(`tar -xf "${src}" -C "${dest}"`);
    return { success: r.exit_code === 0, output: (r.stdout + r.stderr).trim(), error: r.error };
}

export async function listArchive(archivePath: string): Promise<ArchiveResult> {
    const src = resolvePath(archivePath);
    const ext = path.extname(src).toLowerCase();
    let r;
    if (ext === '.zip') {
        r = await executeShell(`unzip -l "${src}"`);
    } else if (ext === '.gz' || ext === '.tar' || ext === '.tgz' || ext === '.bz2' || ext === '.xz') {
        r = await executeShell(`tar -tf "${src}"`);
    } else {
        return { success: false, error: `Unknown archive format: ${ext}` };
    }
    const files = (r.stdout || '').split('\n').filter(l => l.trim()).slice(0, 200);
    return { success: r.exit_code === 0, files, output: r.stdout?.slice(0, 3000), error: r.error };
}
