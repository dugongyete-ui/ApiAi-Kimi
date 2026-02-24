import { PassThrough } from 'stream';
import logger from '@/lib/logger.ts';
import util from '@/lib/util.ts';
import { ConnectRPCClient } from '@/lib/connect-rpc';
import type { ConnectConfig } from '@/lib/connect-rpc/types.ts';
import { executeShell } from '@/lib/tools/shell.ts';
import { fetchUrl } from '@/lib/tools/browser.ts';
import { webSearch } from '@/lib/tools/search.ts';
import { readFile, writeFile, appendFile, listFiles, deleteFile } from '@/lib/tools/file.ts';
import { httpRequest } from '@/lib/tools/http-request.ts';
import { executeCode } from '@/lib/tools/code-execute.ts';
import { createZip, extractZip, createTar, extractTar, listArchive } from '@/lib/tools/archive.ts';
import {
    browserNavigate, browserScreenshot, browserClick, browserType,
    browserScroll, browserGetText, browserGetHTML, browserEval,
} from '@/lib/tools/playwright-browser.ts';

const MAX_ITERATIONS = 30;
const MAX_TOOL_RESULT_LEN = 8000;

// ─── System prompt ────────────────────────────────────────────────────────────
const TOOLS_PROMPT = `You are an autonomous AI agent like Manus.im with access to a real computer environment.
When you need to perform an action, output ONLY a single line starting with TOOL_CALL: followed by JSON.

FORMAT (must be on ONE line, no other text on that line):
TOOL_CALL: {"name":"TOOL_NAME","args":{...}}

═══════════════════════════════════════════════════════
AVAILABLE TOOLS:
═══════════════════════════════════════════════════════

── TERMINAL ──────────────────────────────────────────
- shell              : Run any bash command
  args: {"command":"ls -la && cat file.txt"}

── BROWSER (Fast HTML fetch) ─────────────────────────
- browser            : Fetch & parse a URL (returns text)
  args: {"url":"https://example.com"}

── BROWSER AUTOMATION (Playwright - for JS-heavy sites) ─
- browser_navigate   : Navigate to URL in live browser session
  args: {"url":"https://example.com"}
- browser_screenshot : Take screenshot of current page or URL
  args: {"url":"https://example.com"} or {"url":null,"selector":"#main"}
- browser_click      : Click an element by CSS selector
  args: {"selector":"button.submit"}
- browser_type       : Type text into an input field
  args: {"selector":"input[name=q]","text":"hello world","clear":true}
- browser_scroll     : Scroll the page
  args: {"direction":"down","amount":500}
- browser_get_text   : Get visible text from page or element
  args: {"selector":null} or {"selector":"#content"}
- browser_eval       : Execute JavaScript in the browser
  args: {"code":"document.title"}

── WEB SEARCH ────────────────────────────────────────
- web_search         : Search the web and return results
  args: {"query":"search terms"}

── HTTP API ──────────────────────────────────────────
- http_request       : Make HTTP requests (REST API calls)
  args: {"method":"POST","url":"https://api.example.com/data","headers":{"Content-Type":"application/json"},"body":{"key":"value"}}

── CODE EXECUTION ────────────────────────────────────
- code_execute       : Run code in Python, JavaScript, TypeScript, Bash, Ruby
  args: {"language":"python","code":"print('hello')\nfor i in range(3): print(i)"}
  args: {"language":"javascript","code":"console.log(Math.PI)"}

── FILE SYSTEM ───────────────────────────────────────
- file_read          : Read a file from agent-workspace/
  args: {"path":"report.txt"}
- file_write         : Write/create a file (overwrites)
  args: {"path":"output.txt","content":"Hello World"}
- file_append        : Append content to a file
  args: {"path":"log.txt","content":"new line\n"}
- file_list          : List files in a directory
  args: {"path":"."}
- file_delete        : Delete a file
  args: {"path":"old.txt"}

── ARCHIVES ──────────────────────────────────────────
- archive_create_zip  : Create a ZIP archive
  args: {"path":"output.zip","sources":["file1.txt","folder/"]}
- archive_extract_zip : Extract a ZIP archive
  args: {"path":"archive.zip","dest":"output_dir/"}
- archive_create_tar  : Create a TAR.GZ archive
  args: {"path":"output.tar.gz","sources":["file1.txt"]}
- archive_extract_tar : Extract a TAR archive
  args: {"path":"archive.tar.gz","dest":"output_dir/"}
- archive_list        : List contents of an archive
  args: {"path":"archive.zip"}

── COMMUNICATION ─────────────────────────────────────
- message            : Send a status message to the user
  args: {"content":"Task 1/3 complete..."}

═══════════════════════════════════════════════════════

RULES:
1. Output exactly ONE TOOL_CALL line when you need a tool. Nothing else on that line.
2. After [TOOL RESULT] is received, analyze it and continue with the next step.
3. When all steps are done, write your final answer in plain text (no TOOL_CALL).
4. You MUST actually call tools to complete tasks — do not simulate or describe results.
5. For complex tasks: break into steps, use message tool to report progress.
6. Screenshots are saved to agent-workspace/screenshots/ — report the file path to user.
7. The file_* tools use agent-workspace/ as root directory.

TASK:`;

// ─── JWT helpers ──────────────────────────────────────────────────────────────
function jwtField(token: string, field: string): string | undefined {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())[field];
    } catch { return undefined; }
}

function createRPCClient(authToken: string): ConnectRPCClient {
    const config: ConnectConfig = {
        baseUrl: 'https://www.kimi.com',
        authToken,
        deviceId: jwtField(authToken, 'device_id'),
        sessionId: jwtField(authToken, 'ssid'),
        userId: jwtField(authToken, 'sub'),
    };
    return new ConnectRPCClient(config);
}

// ─── Message helpers ──────────────────────────────────────────────────────────
function getLastUserText(messages: any[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const c = messages[i].content;
            if (typeof c === 'string') return c;
            if (Array.isArray(c)) return c.filter((x: any) => x.type === 'text').map((x: any) => x.text).join('\n');
        }
    }
    return '';
}

// ─── Tool call parser ─────────────────────────────────────────────────────────
function parseToolCall(text: string): { name: string; args: Record<string, any> } | null {
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('TOOL_CALL:')) {
            const jsonStr = trimmed.slice('TOOL_CALL:'.length).trim();
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.name) return { name: parsed.name, args: parsed.args || {} };
            } catch { /* malformed */ }
        }
    }
    return null;
}

// ─── Kimi chat ─────────────────────────────────────────────────────────────────
async function kimiChat(client: ConnectRPCClient, text: string, chatId?: string): Promise<{ text: string; chatId: string }> {
    const resp = await client.chatText(text, { chatId });
    return { text: resp.text || '', chatId: resp.chatId || chatId || '' };
}

// ─── Real tool executor ────────────────────────────────────────────────────────
async function runTool(name: string, args: Record<string, any>): Promise<string> {
    logger.info(`[Agent] Tool: ${name}  args: ${JSON.stringify(args).slice(0, 200)}`);

    switch (name) {
        // ── Terminal ──
        case 'shell': {
            const r = await executeShell(String(args.command || ''));
            let out = '';
            if (r.stdout) out += `STDOUT:\n${r.stdout}\n`;
            if (r.stderr) out += `STDERR:\n${r.stderr}\n`;
            if (r.error) out += `ERROR: ${r.error}\n`;
            if (r.timed_out) out += `[Timed out]\n`;
            out += `Exit: ${r.exit_code}`;
            return out.trim() || '(no output)';
        }

        // ── Browser (fast fetch) ──
        case 'browser': {
            const r = await fetchUrl(String(args.url || ''));
            if (r.error) return `Error: ${r.error}`;
            return `URL: ${r.url}\nTitle: ${r.title}\n\n${r.content}`;
        }

        // ── Playwright browser ──
        case 'browser_navigate': {
            const r = await browserNavigate(String(args.url || ''));
            if (!r.success) return `Error: ${r.error}`;
            return `Navigated to: ${r.url}\nTitle: ${r.title}`;
        }
        case 'browser_screenshot': {
            const r = await browserScreenshot(args.url ? String(args.url) : undefined, args.selector);
            if (!r.success) return `Error: ${r.error}`;
            return `Screenshot saved: ${r.path}\n(${r.base64 ? Math.round(r.base64.length * 0.75 / 1024) + ' KB' : '?'})`;
        }
        case 'browser_click': {
            const r = await browserClick(String(args.selector || ''));
            return r.success ? `Clicked: ${args.selector}` : `Error: ${r.error}`;
        }
        case 'browser_type': {
            const r = await browserType(String(args.selector || ''), String(args.text || ''), args.clear !== false);
            return r.success ? `Typed into: ${args.selector}` : `Error: ${r.error}`;
        }
        case 'browser_scroll': {
            const r = await browserScroll(args.direction || 'down', Number(args.amount) || 500);
            return r.success ? `Scrolled ${args.direction} by ${args.amount || 500}px` : `Error: ${r.error}`;
        }
        case 'browser_get_text': {
            const r = await browserGetText(args.selector);
            if (!r.success) return `Error: ${r.error}`;
            return `URL: ${r.url}\nTitle: ${r.title}\n\n${r.text}`;
        }
        case 'browser_get_html': {
            const r = await browserGetHTML(args.selector);
            return r.success ? r.html : `Error: ${r.error}`;
        }
        case 'browser_eval': {
            const r = await browserEval(String(args.code || ''));
            if (!r.success) return `Error: ${r.error}`;
            return `Result: ${JSON.stringify(r.result)}`;
        }

        // ── Web search ──
        case 'web_search': {
            const r = await webSearch(String(args.query || ''));
            if (r.error) return `Error: ${r.error}`;
            return r.results.map((x, i) => `[${i + 1}] ${x.title}\n    ${x.url}\n    ${x.snippet}`).join('\n\n') || 'No results.';
        }

        // ── HTTP requests ──
        case 'http_request': {
            const r = await httpRequest({
                method: args.method,
                url: String(args.url || ''),
                headers: args.headers,
                body: args.body,
                timeout: Number(args.timeout) || 30,
                follow_redirects: args.follow_redirects,
            });
            if (!r.success && r.error) return `Error: ${r.error}`;
            let out = `HTTP ${r.status} ${r.status_text} (${r.elapsed_ms}ms)\n`;
            if (r.json) {
                out += `Body (JSON):\n${JSON.stringify(r.json, null, 2).slice(0, 4000)}`;
            } else {
                out += `Body:\n${(r.body || '').slice(0, 4000)}`;
            }
            return out;
        }

        // ── Code execution ──
        case 'code_execute': {
            const r = await executeCode(String(args.language || 'python'), String(args.code || ''));
            let out = '';
            if (r.stdout) out += `Output:\n${r.stdout}\n`;
            if (r.stderr) out += `Stderr:\n${r.stderr}\n`;
            if (r.error) out += `Error: ${r.error}\n`;
            out += `Exit: ${r.exit_code}`;
            return out.trim() || '(no output)';
        }

        // ── File system ──
        case 'file_read': {
            const r = await readFile(String(args.path || ''));
            return r.success ? String(r.content) : `Error: ${r.error}`;
        }
        case 'file_write': {
            const r = await writeFile(String(args.path || ''), String(args.content || ''));
            return r.success ? `Written: ${r.path}` : `Error: ${r.error}`;
        }
        case 'file_append': {
            const r = await appendFile(String(args.path || ''), String(args.content || ''));
            return r.success ? `Appended to: ${r.path}` : `Error: ${r.error}`;
        }
        case 'file_list': {
            const r = await listFiles(String(args.path || '.'));
            return r.success ? (r.files?.join('\n') || '(empty)') : `Error: ${r.error}`;
        }
        case 'file_delete': {
            const r = await deleteFile(String(args.path || ''));
            return r.success ? `Deleted: ${r.path}` : `Error: ${r.error}`;
        }

        // ── Archives ──
        case 'archive_create_zip': {
            const r = await createZip(String(args.path || ''), args.sources || []);
            return r.success ? `ZIP created: ${args.path}` : `Error: ${r.error || r.output}`;
        }
        case 'archive_extract_zip': {
            const r = await extractZip(String(args.path || ''), args.dest);
            return r.success ? `Extracted to: ${args.dest || 'agent-workspace/'}` : `Error: ${r.error || r.output}`;
        }
        case 'archive_create_tar': {
            const r = await createTar(String(args.path || ''), args.sources || []);
            return r.success ? `TAR created: ${args.path}` : `Error: ${r.error || r.output}`;
        }
        case 'archive_extract_tar': {
            const r = await extractTar(String(args.path || ''), args.dest);
            return r.success ? `Extracted to: ${args.dest || 'agent-workspace/'}` : `Error: ${r.error || r.output}`;
        }
        case 'archive_list': {
            const r = await listArchive(String(args.path || ''));
            return r.success ? (r.files?.join('\n') || r.output || '(empty)') : `Error: ${r.error}`;
        }

        // ── Message ──
        case 'message':
            return `[User notified: ${args.content}]`;

        default:
            return `Unknown tool: "${name}". See available tools in the system prompt.`;
    }
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────
function sseJson(stream: PassThrough, obj: object) {
    stream.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseChunk(stream: PassThrough, content: string, id: string, model: string, finish: string | null = null) {
    sseJson(stream, {
        id, object: 'chat.completion.chunk',
        created: util.unixTimestamp(), model,
        choices: [{ index: 0, delta: finish !== null ? {} : { content }, finish_reason: finish }],
    });
}

function truncate(s: string, max: number) {
    return s.length <= max ? s : s.slice(0, max) + `\n...[+${s.length - max} chars truncated]`;
}

// ─── Main agent stream ────────────────────────────────────────────────────────
export async function createAgentStream(
    model: string,
    messages: any[],
    authToken: string,
    convId?: string,
): Promise<PassThrough> {
    const out = new PassThrough();
    const id = 'agent-' + util.uuid(false);

    setImmediate(async () => {
        const client = createRPCClient(authToken);
        let chatId = convId;
        let iterations = 0;

        sseJson(out, { type: 'agent_start', id, message: 'Agent started' });

        try {
            const userTask = getLastUserText(messages);
            const firstMsg = `${TOOLS_PROMPT}\n${userTask}`;

            logger.info(`[Agent] Starting, task length: ${userTask.length}, chatId: ${chatId || 'new'}`);
            const first = await kimiChat(client, firstMsg, chatId);
            chatId = first.chatId;
            let responseText = first.text.trim();

            while (iterations < MAX_ITERATIONS) {
                iterations++;
                logger.info(`[Agent] Iter ${iterations}: ${responseText.slice(0, 100)}`);

                const tool = parseToolCall(responseText);

                if (!tool) {
                    // Final answer
                    sseJson(out, { type: 'agent_done', iterations, id });
                    sseChunk(out, responseText, id, model);
                    sseChunk(out, '', id, model, 'stop');
                    out.write('data: [DONE]\n\n');
                    out.end();
                    return;
                }

                // Emit tool call event
                sseJson(out, { type: 'tool_call', id, iteration: iterations, tool: tool.name, arguments: tool.args });

                // Execute tool
                let result: string;
                try {
                    result = await runTool(tool.name, tool.args);
                } catch (e: any) {
                    result = `Tool execution error: ${e.message}`;
                }
                result = truncate(result, MAX_TOOL_RESULT_LEN);

                // Emit result
                sseJson(out, { type: 'tool_result', id, iteration: iterations, tool: tool.name, result: truncate(result, 2000) });

                // Stream message tool content to user
                if (tool.name === 'message') {
                    sseChunk(out, `[${tool.args.content}]\n`, id, model);
                }

                // Send result back to Kimi and continue
                const followUp = `[TOOL RESULT from ${tool.name} (iteration ${iterations})]:\n${result}\n\nContinue. If more steps needed, output next TOOL_CALL. If done, write final answer (no TOOL_CALL).`;
                const next = await kimiChat(client, followUp, chatId);
                chatId = next.chatId || chatId;
                responseText = next.text.trim();
            }

            // Max iterations reached
            const msg = `Agent reached maximum iterations (${MAX_ITERATIONS}). Last response:\n${responseText}`;
            sseJson(out, { type: 'agent_limit', id, iterations });
            sseChunk(out, msg, id, model);
            sseChunk(out, '', id, model, 'stop');
            out.write('data: [DONE]\n\n');
            out.end();

        } catch (e: any) {
            logger.error(`[Agent] Error: ${e.message}`);
            sseJson(out, { type: 'agent_error', id, error: e.message });
            sseChunk(out, `[Agent Error]: ${e.message}`, id, model);
            sseChunk(out, '', id, model, 'stop');
            out.write('data: [DONE]\n\n');
            out.end();
        }
    });

    return out;
}
