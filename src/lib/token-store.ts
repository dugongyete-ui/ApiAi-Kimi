import path from 'path';
import fs from 'fs-extra';
import logger from '@/lib/logger.ts';

const TOKEN_FILE = path.join(path.resolve(), 'data', 'token.json');

interface StoredToken {
    token: string;
    saved_at: string;
    expires_at: string | null;
    expires_timestamp: number | null;
}

class TokenStore {
    private data: StoredToken | null = null;

    constructor() {
        this.load();
    }

    private load(): void {
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
                this.data = JSON.parse(raw);
                if (this.data && this.isExpired()) {
                    logger.warn('Stored token is expired, clearing...');
                    this.clear();
                    return;
                }
                if (this.data) {
                    logger.success('Token loaded from persistent storage');
                }
            }
        } catch (e) {
            logger.error('Failed to load token from storage:', e);
            this.data = null;
        }
    }

    save(token: string, expiresAt: string | null, expiresTimestamp: number | null): void {
        this.data = {
            token,
            saved_at: new Date().toISOString(),
            expires_at: expiresAt,
            expires_timestamp: expiresTimestamp,
        };
        try {
            fs.ensureDirSync(path.dirname(TOKEN_FILE));
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
            logger.success('Token saved to persistent storage');
        } catch (e) {
            logger.error('Failed to save token to storage:', e);
        }
    }

    getToken(): string {
        if (this.data && !this.isExpired()) {
            return this.data.token;
        }
        if (this.data && this.isExpired()) {
            logger.warn('Token expired, auto-clearing...');
            this.clear();
        }
        return '';
    }

    getInfo(): StoredToken | null {
        if (this.data && this.isExpired()) {
            this.clear();
            return null;
        }
        return this.data;
    }

    isExpired(): boolean {
        if (!this.data || !this.data.expires_timestamp) return false;
        return (Date.now() / 1000) > this.data.expires_timestamp;
    }

    clear(): void {
        this.data = null;
        try {
            if (fs.existsSync(TOKEN_FILE)) {
                fs.removeSync(TOKEN_FILE);
            }
        } catch (e) {
            logger.error('Failed to clear token file:', e);
        }
    }

    hasToken(): boolean {
        return !!this.data && !this.isExpired();
    }
}

export default new TokenStore();
