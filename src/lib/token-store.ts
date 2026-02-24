import path from 'path';
import fs from 'fs-extra';
import randomstring from 'randomstring';
import logger from '@/lib/logger.ts';

const TOKEN_FILE = path.join(path.resolve(), 'data', 'token.json');

const API_KEY_PREFIX = 'sk-kimi-';

interface StoredToken {
    token: string;
    api_key: string;
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
                if (this.data && !this.data.api_key) {
                    this.data.api_key = this.createApiKey();
                    this.persist();
                }
                if (this.data && this.isExpired()) {
                    logger.warn('Stored token is expired, clearing...');
                    this.clear();
                    return;
                }
                if (this.data) {
                    logger.success(`Token loaded from persistent storage (API Key: ${this.data.api_key})`);
                }
            }
        } catch (e) {
            logger.error('Failed to load token from storage:', e);
            this.data = null;
        }
    }

    private createApiKey(): string {
        return API_KEY_PREFIX + randomstring.generate({ length: 32, charset: 'alphanumeric' });
    }

    private persist(): void {
        try {
            fs.ensureDirSync(path.dirname(TOKEN_FILE));
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (e) {
            logger.error('Failed to persist token storage:', e);
        }
    }

    save(token: string, expiresAt: string | null, expiresTimestamp: number | null): string {
        const apiKey = this.data?.api_key || this.createApiKey();
        this.data = {
            token,
            api_key: apiKey,
            saved_at: new Date().toISOString(),
            expires_at: expiresAt,
            expires_timestamp: expiresTimestamp,
        };
        this.persist();
        logger.success(`Token saved. API Key: ${apiKey}`);
        return apiKey;
    }

    rotateApiKey(): string {
        if (!this.data) return '';
        this.data.api_key = this.createApiKey();
        this.persist();
        logger.success(`API Key rotated: ${this.data.api_key}`);
        return this.data.api_key;
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

    resolveApiKey(apiKey: string): string {
        if (!this.data || !apiKey) return '';
        if (this.isExpired()) {
            this.clear();
            return '';
        }
        if (this.data.api_key === apiKey) {
            return this.data.token;
        }
        return '';
    }

    isApiKey(value: string): boolean {
        return typeof value === 'string' && value.startsWith(API_KEY_PREFIX);
    }

    getApiKey(): string {
        if (!this.data || this.isExpired()) return '';
        return this.data.api_key;
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
