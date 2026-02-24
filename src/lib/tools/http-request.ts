import axios, { Method } from 'axios';

export interface HttpRequestOptions {
    method?: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
    follow_redirects?: boolean;
}

export interface HttpResponse {
    success: boolean;
    status?: number;
    status_text?: string;
    headers?: Record<string, string>;
    body?: string;
    json?: any;
    error?: string;
    elapsed_ms?: number;
}

export async function httpRequest(opts: HttpRequestOptions): Promise<HttpResponse> {
    const start = Date.now();
    try {
        const method = (opts.method || 'GET').toUpperCase() as Method;
        const resp = await axios.request({
            method,
            url: opts.url,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AgentBot/1.0)',
                ...(opts.headers || {}),
            },
            data: opts.body,
            timeout: (opts.timeout || 30) * 1000,
            maxRedirects: opts.follow_redirects === false ? 0 : 10,
            validateStatus: () => true,
        });

        const elapsed = Date.now() - start;
        const rawBody = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        let json: any = undefined;
        try { json = typeof resp.data === 'object' ? resp.data : JSON.parse(rawBody); } catch {}

        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.headers || {})) {
            respHeaders[k] = String(v);
        }

        return {
            success: resp.status >= 200 && resp.status < 400,
            status: resp.status,
            status_text: resp.statusText,
            headers: respHeaders,
            body: rawBody.slice(0, 8000),
            json,
            elapsed_ms: elapsed,
        };
    } catch (e: any) {
        return { success: false, error: e.message, elapsed_ms: Date.now() - start };
    }
}
