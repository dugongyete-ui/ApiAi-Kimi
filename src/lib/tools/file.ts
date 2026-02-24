import path from 'path';
import fs from 'fs-extra';

const WORKSPACE_ROOT = path.join(path.resolve(), 'agent-workspace');
const MAX_READ_SIZE = 10000;

function safePath(filePath: string): string {
    const normalized = path.normalize(filePath.replace(/^\/+/, ''));
    const resolved = path.join(WORKSPACE_ROOT, normalized);
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
        throw new Error(`Access denied: path must be within agent workspace`);
    }
    return resolved;
}

export interface FileResult {
    success: boolean;
    content?: string;
    files?: string[];
    path?: string;
    error?: string;
}

export async function readFile(filePath: string): Promise<FileResult> {
    try {
        await fs.ensureDir(WORKSPACE_ROOT);
        const full = safePath(filePath);

        if (!await fs.pathExists(full)) {
            return { success: false, error: `File not found: ${filePath}` };
        }

        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
            return { success: false, error: `Path is a directory, use file_list instead` };
        }

        const content = await fs.readFile(full, 'utf-8');
        return {
            success: true,
            content: content.length > MAX_READ_SIZE
                ? content.slice(0, MAX_READ_SIZE) + `\n...(truncated, ${content.length} total chars)`
                : content,
            path: filePath,
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function writeFile(filePath: string, content: string): Promise<FileResult> {
    try {
        await fs.ensureDir(WORKSPACE_ROOT);
        const full = safePath(filePath);
        await fs.ensureDir(path.dirname(full));
        await fs.writeFile(full, content, 'utf-8');
        return { success: true, path: filePath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function appendFile(filePath: string, content: string): Promise<FileResult> {
    try {
        await fs.ensureDir(WORKSPACE_ROOT);
        const full = safePath(filePath);
        await fs.ensureDir(path.dirname(full));
        await fs.appendFile(full, content, 'utf-8');
        return { success: true, path: filePath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function listFiles(dirPath: string = '.'): Promise<FileResult> {
    try {
        await fs.ensureDir(WORKSPACE_ROOT);
        const full = safePath(dirPath);

        if (!await fs.pathExists(full)) {
            return { success: false, error: `Directory not found: ${dirPath}` };
        }

        const entries = await fs.readdir(full, { withFileTypes: true });
        const files = entries.map(e => {
            const name = e.isDirectory() ? `${e.name}/` : e.name;
            return name;
        });

        return { success: true, files, path: dirPath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteFile(filePath: string): Promise<FileResult> {
    try {
        await fs.ensureDir(WORKSPACE_ROOT);
        const full = safePath(filePath);
        await fs.remove(full);
        return { success: true, path: filePath };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
