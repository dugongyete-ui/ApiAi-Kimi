import crypto from 'crypto';
import logger from './logger.ts';

const MAX_SESSIONS = 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

interface SessionEntry {
    chatId: string;
    createdAt: number;
    lastUsedAt: number;
}

class SessionStore {
    private store = new Map<string, SessionEntry>();

    private hashMessages(messages: any[]): string {
        const normalized = JSON.stringify(messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })));
        return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 24);
    }

    private makeKey(tokenPrefix: string, priorMessages: any[]): string {
        const msgHash = this.hashMessages(priorMessages);
        const tokenHash = crypto.createHash('sha256').update(tokenPrefix).digest('hex').slice(0, 12);
        return `${tokenHash}:${msgHash}`;
    }

    /**
     * Find existing Kimi chat ID based on prior conversation history.
     * messages includes the new user message as last element.
     * We look up based on all messages EXCEPT the last one.
     */
    findSession(token: string, messages: any[]): string | null {
        if (messages.length <= 1) {
            return null;
        }
        const priorMessages = messages.slice(0, -1);
        const key = this.makeKey(token.slice(0, 30), priorMessages);
        const entry = this.store.get(key);

        if (!entry) return null;

        if (Date.now() - entry.lastUsedAt > SESSION_TTL_MS) {
            this.store.delete(key);
            logger.info(`Session TTL expired: ${key}`);
            return null;
        }

        entry.lastUsedAt = Date.now();
        logger.info(`Resuming session: chatId=${entry.chatId}`);
        return entry.chatId;
    }

    /**
     * Save session for future lookup.
     * After a completed turn, save mapping of (messages + assistantReply) → chatId
     * so the next request can find it by looking up messages.slice(0, -1).
     */
    saveSession(token: string, messages: any[], chatId: string, assistantReply: string): void {
        const fullHistory = [
            ...messages,
            { role: 'assistant', content: assistantReply },
        ];
        const key = this.makeKey(token.slice(0, 30), fullHistory);
        this.store.set(key, {
            chatId,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
        });
        logger.info(`Session saved: chatId=${chatId}, key=${key}, total sessions=${this.store.size}`);

        if (this.store.size > MAX_SESSIONS) {
            this.cleanup();
        }
    }

    private cleanup(): void {
        const now = Date.now();
        let removed = 0;
        const entries = [...this.store.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
        for (const [key, entry] of entries) {
            if (now - entry.lastUsedAt > SESSION_TTL_MS || removed < 100) {
                this.store.delete(key);
                removed++;
            }
            if (removed >= 100 && this.store.size <= MAX_SESSIONS * 0.8) break;
        }
        logger.info(`Session cleanup: removed ${removed} sessions`);
    }

    size(): number {
        return this.store.size;
    }
}

export default new SessionStore();
