import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = path.join(process.cwd(), 'agent-workspace');
const MEMORY_FILE = path.join(WORKSPACE, '.memory.json');

export interface MemoryEntry {
    id: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export interface MemoryResult {
    success: boolean;
    action: string;
    entries?: MemoryEntry[];
    entry?: MemoryEntry;
    message?: string;
    error?: string;
}

function ensureWorkspace() {
    if (!fs.existsSync(WORKSPACE)) fs.mkdirSync(WORKSPACE, { recursive: true });
}

function loadMemory(): MemoryEntry[] {
    ensureWorkspace();
    if (!fs.existsSync(MEMORY_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function saveMemory(entries: MemoryEntry[]) {
    ensureWorkspace();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function memorySpaceEdits(
    action: 'add' | 'replace' | 'remove' | 'list' | 'clear',
    args: { id?: string; content?: string; old_content?: string }
): MemoryResult {
    const entries = loadMemory();
    const now = new Date().toISOString();

    switch (action) {
        case 'add': {
            if (!args.content) return { success: false, action, error: 'content is required for add' };
            const entry: MemoryEntry = {
                id: generateId(),
                content: args.content,
                created_at: now,
                updated_at: now,
            };
            entries.push(entry);
            saveMemory(entries);
            return { success: true, action, entry, message: `Memory saved with id: ${entry.id}` };
        }

        case 'replace': {
            if (!args.id && !args.old_content) return { success: false, action, error: 'id or old_content required for replace' };
            if (!args.content) return { success: false, action, error: 'content required for replace' };

            const idx = args.id
                ? entries.findIndex(e => e.id === args.id)
                : entries.findIndex(e => e.content.includes(args.old_content!));

            if (idx === -1) return { success: false, action, error: 'Memory entry not found' };

            entries[idx].content = args.content;
            entries[idx].updated_at = now;
            saveMemory(entries);
            return { success: true, action, entry: entries[idx], message: `Memory updated: ${entries[idx].id}` };
        }

        case 'remove': {
            if (!args.id && !args.content) return { success: false, action, error: 'id or content required for remove' };

            const before = entries.length;
            const filtered = args.id
                ? entries.filter(e => e.id !== args.id)
                : entries.filter(e => !e.content.includes(args.content!));

            if (filtered.length === before) return { success: false, action, error: 'Memory entry not found' };

            saveMemory(filtered);
            return { success: true, action, message: `Removed ${before - filtered.length} memory entry/entries` };
        }

        case 'list': {
            return { success: true, action, entries, message: `${entries.length} memory entries` };
        }

        case 'clear': {
            saveMemory([]);
            return { success: true, action, message: 'All memory cleared' };
        }

        default:
            return { success: false, action, error: `Unknown action: ${action}. Use: add, replace, remove, list, clear` };
    }
}
