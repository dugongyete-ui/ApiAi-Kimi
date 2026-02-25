import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { executeShell } from './shell.ts';
import axios from 'axios';

export interface SystemResult {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
}

// ─── Environment Variables ────────────────────────────────────────────────────

export function getEnvironmentVariables(filter = ''): SystemResult {
    const envVars = process.env;
    let result: Record<string, string> = {};

    const SAFE_KEYS = [
        'NODE_ENV', 'NODE_VERSION', 'PATH', 'HOME', 'USER', 'SHELL',
        'LANG', 'TZ', 'PORT', 'HOST', 'PWD', 'TMPDIR', 'TERM',
        'npm_package_version', 'npm_package_name',
    ];

    for (const key of Object.keys(envVars)) {
        const isSafe = SAFE_KEYS.some(safe => key === safe || key.startsWith('npm_') || key.startsWith('NODE_'));
        const matchesFilter = !filter || key.toLowerCase().includes(filter.toLowerCase());

        if (matchesFilter) {
            const val = envVars[key] || '';
            const isSensitive = /SECRET|TOKEN|PASSWORD|KEY|APIKEY|API_KEY|CREDENTIAL|AUTH/i.test(key);
            result[key] = isSensitive ? `[REDACTED - ${val.length} chars]` : val;
        }
    }

    return {
        success: true,
        data: result,
        message: `${Object.keys(result).length} environment variables${filter ? ` matching "${filter}"` : ''}`,
    };
}

export function setEnvironmentVariable(key: string, value: string): SystemResult {
    const PROTECTED = ['HOME', 'PATH', 'USER', 'SHELL'];
    if (PROTECTED.includes(key)) {
        return { success: false, error: `Cannot modify protected variable: ${key}` };
    }
    try {
        process.env[key] = value;
        return { success: true, message: `Environment variable ${key} set (session-only, not persisted to disk)`, data: { key, value_length: value.length } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ─── System Info ──────────────────────────────────────────────────────────────

export async function getSystemInfo(): Promise<SystemResult> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const r = await executeShell('uname -a && lsb_release -d 2>/dev/null || cat /etc/os-release 2>/dev/null | head -3; node -v; python3 -V 2>&1; pip3 -V 2>&1 | head -1');

    return {
        success: true,
        data: {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            os_release: os.release(),
            os_version: os.version(),
            uptime_seconds: Math.round(os.uptime()),
            cpu: {
                model: cpus[0]?.model || 'Unknown',
                cores: cpus.length,
                speed_mhz: cpus[0]?.speed || 0,
            },
            memory: {
                total_gb: +(totalMem / 1024 / 1024 / 1024).toFixed(2),
                used_gb: +(usedMem / 1024 / 1024 / 1024).toFixed(2),
                free_gb: +(freeMem / 1024 / 1024 / 1024).toFixed(2),
                used_pct: Math.round((usedMem / totalMem) * 100),
            },
            node_version: process.version,
            cwd: process.cwd(),
            tmpdir: os.tmpdir(),
            shell_info: r.stdout?.trim() || '',
        },
    };
}

// ─── Disk Usage ───────────────────────────────────────────────────────────────

export async function checkDiskUsage(dirPath = '/'): Promise<SystemResult> {
    const r = await executeShell(`df -h ${JSON.stringify(dirPath)} 2>&1 && du -sh ${JSON.stringify(path.join(process.cwd(), 'agent-workspace'))} 2>/dev/null || echo "workspace: n/a"`);

    if (r.exit_code !== 0) {
        return { success: false, error: r.stderr || 'Could not get disk info' };
    }

    const lines = (r.stdout || '').split('\n').filter(Boolean);
    return {
        success: true,
        data: {
            df_output: r.stdout?.trim(),
            raw_lines: lines,
        },
        message: 'Disk usage info',
    };
}

// ─── Check Website Status ─────────────────────────────────────────────────────

export async function checkWebsiteStatus(url: string, timeout = 10): Promise<SystemResult> {
    if (!url.startsWith('http')) url = 'https://' + url;

    const start = Date.now();
    try {
        const resp = await axios.head(url, {
            timeout: timeout * 1000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AgentBot/1.0)' },
            validateStatus: () => true,
        });
        const elapsed = Date.now() - start;
        const status = resp.status;
        const ok = status >= 200 && status < 400;

        return {
            success: ok,
            data: {
                url,
                status,
                status_text: resp.statusText || (ok ? 'OK' : 'Error'),
                ok,
                latency_ms: elapsed,
                content_type: resp.headers['content-type'],
                server: resp.headers['server'],
                redirect_count: resp.request?._redirects?.length || 0,
            },
            message: `${url} → HTTP ${status} (${elapsed}ms)`,
        };
    } catch (e: any) {
        const elapsed = Date.now() - start;
        const isTimeout = e.code === 'ECONNABORTED' || e.message?.includes('timeout');
        const isRefused = e.code === 'ECONNREFUSED';
        const isDns = e.code === 'ENOTFOUND';
        return {
            success: false,
            data: {
                url,
                status: 0,
                ok: false,
                latency_ms: elapsed,
                error_code: e.code,
                error_type: isTimeout ? 'timeout' : isRefused ? 'connection_refused' : isDns ? 'dns_failed' : 'error',
            },
            error: e.message,
            message: `${url} → ${isTimeout ? 'TIMEOUT' : isRefused ? 'CONNECTION REFUSED' : isDns ? 'DNS FAILED' : 'ERROR'} (${elapsed}ms)`,
        };
    }
}
