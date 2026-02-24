import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import logger from '@/lib/logger.ts';

const SCREENSHOT_DIR = path.join(process.cwd(), 'agent-workspace', 'screenshots');
const CHROMIUM_PATH = '/home/runner/.playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell';

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

async function ensureBrowser() {
    if (!browser || !browser.isConnected()) {
        browser = await chromium.launch({
            executablePath: CHROMIUM_PATH,
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-gpu',
                '--disable-web-security', '--no-first-run',
                '--disable-extensions', '--single-process',
            ],
        });
        context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US',
        });
        page = await context.newPage();
        logger.info('[PwBrowser] Browser started');
    }
    if (!page || page.isClosed()) {
        page = await context!.newPage();
    }
    return page;
}

function ensureScreenshotDir() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
}

export async function browserNavigate(url: string): Promise<{ success: boolean; url: string; title: string; error?: string }> {
    try {
        const p = await ensureBrowser();
        const resp = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await p.waitForTimeout(1500);
        const title = await p.title();
        return { success: true, url: p.url(), title };
    } catch (e: any) {
        return { success: false, url, title: '', error: e.message };
    }
}

export async function browserScreenshot(url?: string, selector?: string): Promise<{ success: boolean; path: string; base64?: string; error?: string }> {
    try {
        ensureScreenshotDir();
        const p = await ensureBrowser();
        if (url) {
            await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await p.waitForTimeout(2000);
        }
        const fname = `screenshot_${Date.now()}.png`;
        const fpath = path.join(SCREENSHOT_DIR, fname);
        if (selector) {
            const el = await p.$(selector);
            if (el) {
                await el.screenshot({ path: fpath });
            } else {
                await p.screenshot({ path: fpath, fullPage: false });
            }
        } else {
            await p.screenshot({ path: fpath, fullPage: false });
        }
        const base64 = fs.readFileSync(fpath).toString('base64');
        logger.info(`[PwBrowser] Screenshot saved: ${fpath}`);
        return { success: true, path: `agent-workspace/screenshots/${fname}`, base64 };
    } catch (e: any) {
        return { success: false, path: '', error: e.message };
    }
}

export async function browserClick(selector: string): Promise<{ success: boolean; error?: string }> {
    try {
        const p = await ensureBrowser();
        await p.click(selector, { timeout: 10000 });
        await p.waitForTimeout(500);
        return { success: true };
    } catch (e: any) {
        try {
            const p = await ensureBrowser();
            await p.evaluate((sel) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (el) el.click();
            }, selector);
            return { success: true };
        } catch (e2: any) {
            return { success: false, error: e.message };
        }
    }
}

export async function browserType(selector: string, text: string, clear = true): Promise<{ success: boolean; error?: string }> {
    try {
        const p = await ensureBrowser();
        await p.click(selector, { timeout: 8000 });
        if (clear) await p.fill(selector, '');
        await p.type(selector, text, { delay: 30 });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function browserScroll(direction: 'up' | 'down' | 'left' | 'right', amount = 500): Promise<{ success: boolean; error?: string }> {
    try {
        const p = await ensureBrowser();
        const x = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
        const y = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
        await p.evaluate(({ x, y }) => window.scrollBy(x, y), { x, y });
        await p.waitForTimeout(300);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function browserGetText(selector?: string): Promise<{ success: boolean; text: string; url?: string; title?: string; error?: string }> {
    try {
        const p = await ensureBrowser();
        const url = p.url();
        const title = await p.title();
        let text: string;
        if (selector) {
            const el = await p.$(selector);
            text = el ? (await el.innerText()) : 'Element not found';
        } else {
            text = await p.evaluate(() => {
                document.querySelectorAll('script,style,nav,footer,header,aside').forEach(e => e.remove());
                return (document.body?.innerText || document.documentElement.innerText || '').replace(/\s+/g, ' ').trim();
            });
        }
        return { success: true, text: text.slice(0, 8000), url, title };
    } catch (e: any) {
        return { success: false, text: '', error: e.message };
    }
}

export async function browserGetHTML(selector?: string): Promise<{ success: boolean; html: string; error?: string }> {
    try {
        const p = await ensureBrowser();
        let html: string;
        if (selector) {
            const el = await p.$(selector);
            html = el ? await el.innerHTML() : 'Element not found';
        } else {
            html = await p.content();
        }
        return { success: true, html: html.slice(0, 10000) };
    } catch (e: any) {
        return { success: false, html: '', error: e.message };
    }
}

export async function browserEval(code: string): Promise<{ success: boolean; result: any; error?: string }> {
    try {
        const p = await ensureBrowser();
        const result = await p.evaluate(new Function(`return (${code})`) as () => any);
        return { success: true, result };
    } catch (e: any) {
        return { success: false, result: null, error: e.message };
    }
}

export async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        context = null;
        page = null;
    }
}
