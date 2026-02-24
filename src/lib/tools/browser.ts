import axios from 'axios';

const MAX_CONTENT = 10000;
const TIMEOUT = 15000;

export interface BrowserResult {
    url: string;
    title: string;
    content: string;
    error?: string;
}

function stripHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
}

export async function fetchUrl(url: string): Promise<BrowserResult> {
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }

    try {
        const resp = await axios.get(url, {
            timeout: TIMEOUT,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            maxContentLength: 3 * 1024 * 1024,
            responseType: 'text',
        });

        const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
        const title = extractTitle(html);
        const content = stripHtml(html).slice(0, MAX_CONTENT);

        return { url, title, content };
    } catch (e: any) {
        return { url, title: '', content: '', error: e.message };
    }
}
