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
import { searchImageByText, searchImageByImage } from '@/lib/tools/image-search.ts';
import { getDataSourceDesc, getDataSource } from '@/lib/tools/datasource.ts';
import { memorySpaceEdits } from '@/lib/tools/memory.ts';
import {
    createDirectory, moveFile, copyFile, createProject, deleteProject,
    switchWorkspace, getProjectStructure, searchInFiles,
} from '@/lib/tools/workspace.ts';
import { installPackage, debugCode, applyPatch } from '@/lib/tools/code-tools.ts';
import { generateMarkdown, generateJson, generateCsv, generateHtml, generatePdf } from '@/lib/tools/file-generator.ts';
import {
    plannerPhase, stepTracker, loopSupervisor, toolValidator, reflectionPass,
    memoryStore, memoryRetrieve,
} from '@/lib/tools/agent-intelligence.ts';
import {
    getEnvironmentVariables, setEnvironmentVariable, getSystemInfo,
    checkDiskUsage, checkWebsiteStatus,
} from '@/lib/tools/system-utils.ts';
import { generateDocx, generateXlsx, generatePptx } from '@/lib/tools/office-generator.ts';
import { placesSearch, placesMapDisplay, weatherFetch } from '@/lib/tools/geo-weather.ts';
import { fetchSportsData, messageCompose, recipeDisplay, strReplace, presentFiles } from '@/lib/tools/specialized.ts';

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

── WEB / URL ACCESS ──────────────────────────────────
- web_open_url       : Open a specific URL and extract readable content
  args: {"url":"https://example.com"}

── IMAGE SEARCH ──────────────────────────────────────
- search_image_by_text  : Search for images by text description (returns up to 10 image URLs)
  args: {"query":"golden gate bridge sunset","limit":8}
- search_image_by_image : Reverse image search — find similar images by URL
  args: {"image_url":"https://example.com/image.jpg","limit":6}

── HTTP API ──────────────────────────────────────────
- http_request       : Make HTTP requests (REST API calls)
  args: {"method":"POST","url":"https://api.example.com/data","headers":{"Content-Type":"application/json"},"body":{"key":"value"}}

── DATA SOURCES (Structured Data) ────────────────────
- get_datasource_desc : Get description and params of a data source (or list all)
  args: {"source":"yahoo_finance"} or {} for all sources

- get_data_source    : Fetch structured data from a named source
  Supported sources and their args:
  • yahoo_finance   : {"source":"yahoo_finance","query":"TSLA","type":"quote"}
                      types: quote | history | search | news | financials
                      For history add: {"period":"1mo","interval":"1d"}
  • binance_crypto  : {"source":"binance_crypto","query":"BTCUSDT","type":"ticker24h"}
                      types: price | ticker24h | klines | exchange_info
                      For klines add: {"interval":"1h","limit":24}
  • world_bank_open_data : {"source":"world_bank_open_data","query":"ID","indicator":"NY.GDP.MKTP.CD","type":"indicator"}
                           types: indicator | country | search_indicators
                           Common indicators: NY.GDP.MKTP.CD (GDP), SP.POP.TOTL (Population),
                           FP.CPI.TOTL.ZG (Inflation), SL.UEM.TOTL.ZS (Unemployment)
  • arxiv           : {"source":"arxiv","query":"large language models 2024","type":"search","max_results":5}
                      types: search | paper (add paper_id for type:paper)
  • google_scholar  : {"source":"google_scholar","query":"transformer attention","type":"search","limit":5}
                      types: search | paper | author

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

── MEMORY ────────────────────────────────────────────
- memory_space_edits : Manage persistent memory across sessions
  args: {"action":"add","content":"User is vegetarian"}
  args: {"action":"replace","id":"mem_123","content":"Updated info"}
  args: {"action":"remove","id":"mem_123"}
  args: {"action":"list"}
  actions: add | replace | remove | list | clear

── COMMUNICATION ─────────────────────────────────────
- message            : Send a status message to the user
  args: {"content":"Task 1/3 complete..."}

── FILE SYSTEM (short aliases) ──────────────────────
- read_file / write_file / list_directory / delete_file : aliases for file_* tools
- create_directory   : Create directory (with parents)
  args: {"path":"my-project/src/utils"}
- move_file          : Move or rename a file
  args: {"src":"draft.txt","dest":"final/report.txt"}
- copy_file          : Copy a file to new location
  args: {"src":"template.html","dest":"pages/about.html"}
- get_project_structure : Tree view of a directory
  args: {"path":".","max_depth":3}
- search_in_files    : Grep text across all files in a directory
  args: {"query":"def main","path":".","glob":"*.py"}

── CODE TOOLS ────────────────────────────────────────
- run_code / run_shell : aliases for code_execute / shell
- install_package    : Install npm/pip/yarn package
  args: {"package_name":"requests","manager":"pip"}
- debug_code         : Run code and analyze errors with suggestions
  args: {"language":"python","code":"import pandas"}
- apply_patch        : Apply a unified diff patch to a file
  args: {"patch":"--- a/f.py\n+++ b/f.py\n@@...","file":"f.py"}

── PROJECT MANAGEMENT ────────────────────────────────
- create_project     : Scaffold a new project directory
  args: {"name":"my-api","template":"node"} (templates: node|python|web|blank)
- delete_project     : Delete project directory (requires confirm:true)
  args: {"name":"old-project","confirm":true}
- switch_workspace   : Set working context to a subdirectory
  args: {"path":"my-project"}

── WEB & NETWORK ─────────────────────────────────────
- fetch_url_content  : alias for web_open_url
- check_website_status : Check if a site is up + response time
  args: {"url":"https://google.com","timeout":10}

── FILE GENERATION ───────────────────────────────────
- generate_pdf       : Generate PDF from text or HTML (uses browser rendering)
  args: {"content":"Hello World","file":"report.pdf","title":"My Report"}
- generate_markdown  : Write a .md file
  args: {"content":"# Title\nContent","file":"notes.md"}
- generate_json      : Save data as formatted JSON file
  args: {"data":{"key":"value"},"file":"result.json"}
- generate_csv       : Generate CSV from array of objects or 2D array
  args: {"data":[{"name":"Alice","score":95}],"file":"scores.csv"}
- generate_html      : Generate HTML file with responsive CSS wrapper
  args: {"content":"<h1>Hello</h1>","file":"index.html","title":"My Page"}
- generate_zip       : alias for archive_create_zip

── AGENT INTELLIGENCE ────────────────────────────────
- planner_phase      : Create structured plan with numbered steps
  args: {"goal":"Build scraper","steps":["Install deps","Write code","Test","Export"]}
- step_tracker       : Track step progress (start/complete/fail/status)
  args: {"action":"complete","step_index":1,"note":"Done"}
- loop_supervisor    : Monitor iteration budget, prevent infinite loops
  args: {"action":"tick"} or {"action":"init","max_iterations":20}
- tool_validator     : Validate tool arguments before calling
  args: {"tool_name":"file_write","args":{"path":"out.txt"}}
- reflection_pass    : Summarize completed work and lessons learned
  args: {"goal":"Scrape data","completed_steps":["Step 1"],"outcome":"success"}
- memory_store       : Store information to persistent memory with optional tag
  args: {"content":"User prefers Python","tag":"preference"}
- memory_retrieve    : Retrieve stored memories, optionally filtered
  args: {"filter":"preference"}

── SYSTEM UTILITIES ──────────────────────────────────
- get_environment_variables : Read env vars (sensitive values auto-redacted)
  args: {} or {"filter":"NODE"}
- set_environment_variable  : Set an env var for current session
  args: {"key":"DEBUG","value":"true"}
- get_system_info    : OS, CPU, memory, Node version, disk info
  args: {}
- check_disk_usage   : Check disk space for a path
  args: {"path":"/"}

═══════════════════════════════════════════════════════

RULES:
1. Output exactly ONE TOOL_CALL line when you need a tool. Nothing else on that line.
2. After [TOOL RESULT] is received, analyze it and continue with the next step.
3. When all steps are done, write your final answer in plain text (no TOOL_CALL).
4. You MUST actually call tools to complete tasks — do not simulate or describe results.
5. For complex tasks: use planner_phase first, then step_tracker to track progress.
6. Use loop_supervisor to prevent infinite loops in iterative tasks.
7. Screenshots are saved to agent-workspace/screenshots/ — report the file path to user.
8. The file_* and generate_* tools use agent-workspace/ as root directory.

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

        // ── Web / URL access ──
        case 'web_open_url': {
            const r = await fetchUrl(String(args.url || ''));
            if (r.error) return `Error: ${r.error}`;
            return `URL: ${r.url}\nTitle: ${r.title}\n\n${r.content}`;
        }

        // ── Image search ──
        case 'search_image_by_text': {
            const r = await searchImageByText(String(args.query || ''), Number(args.limit) || 8);
            if (r.error && r.results.length === 0) return `Error: ${r.error}`;
            return r.results.map((img, i) =>
                `[${i + 1}] ${img.title}\n    Image: ${img.image_url}\n    Thumbnail: ${img.thumbnail_url}\n    Source: ${img.source_url}${img.width ? `\n    Size: ${img.width}x${img.height}` : ''}`
            ).join('\n\n') || 'No image results found.';
        }

        case 'search_image_by_image': {
            const url = String(args.image_url || args.url || '');
            const r = await searchImageByImage(url, Number(args.limit) || 6);
            if (r.error && r.results.length === 0) return `Error: ${r.error}`;
            return r.results.map((img, i) =>
                `[${i + 1}] ${img.title}\n    Image: ${img.image_url}\n    Thumbnail: ${img.thumbnail_url}`
            ).join('\n\n') || 'No similar images found.';
        }

        // ── Data sources ──
        case 'get_datasource_desc': {
            const desc = getDataSourceDesc(args.source);
            return JSON.stringify(desc, null, 2);
        }

        case 'get_data_source': {
            const source = String(args.source || '');
            const { source: _, ...params } = args;
            const r = await getDataSource(source, params);
            if (r.error) return `Error from ${source}: ${r.error}`;
            return `[${source}]\n${JSON.stringify(r.data, null, 2).slice(0, MAX_TOOL_RESULT_LEN)}`;
        }

        // ── Memory ──
        case 'memory_space_edits': {
            const action = args.action as any;
            const r = memorySpaceEdits(action, { id: args.id, content: args.content, old_content: args.old_content });
            if (!r.success) return `Error: ${r.error}`;
            if (action === 'list') {
                if (!r.entries || r.entries.length === 0) return 'Memory is empty.';
                return r.entries.map((e, i) => `[${i + 1}] id=${e.id}\n    ${e.content}\n    (created: ${e.created_at.split('T')[0]})`).join('\n\n');
            }
            return r.message || 'OK';
        }

        // ── Alias: read_file / write_file / list_directory / delete_file ──
        case 'read_file': return runTool('file_read', args);
        case 'write_file': return runTool('file_write', args);
        case 'list_directory': return runTool('file_list', args);
        case 'delete_file': return runTool('file_delete', args);
        case 'run_code': return runTool('code_execute', args);
        case 'run_shell': return runTool('shell', args);
        case 'fetch_url_content': return runTool('web_open_url', { ...args, url: args.url || args.path });

        // ── Workspace / file ops ──
        case 'create_directory': {
            const r = createDirectory(args.path || args.dir || args.directory, args.recursive !== false);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'move_file': {
            const r = moveFile(args.src || args.source || args.from, args.dest || args.destination || args.to);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'copy_file': {
            const r = copyFile(args.src || args.source || args.from, args.dest || args.destination || args.to);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'get_project_structure': {
            const r = await getProjectStructure(args.path || args.dir || '.', args.max_depth || 4);
            return r.success ? `${r.message}\n\n${r.data}` : `Error: ${r.error}`;
        }

        case 'search_in_files': {
            const r = await searchInFiles(args.query || args.pattern, args.path || args.dir || '.', args.glob || '*');
            return r.success ? String(r.data) : `Error: ${r.error}`;
        }

        // ── Project management ──
        case 'create_project': {
            const r = createProject(args.name || args.project, args.template || 'blank');
            return r.success ? `${r.message}\nFiles: ${r.data?.files?.join(', ')}\nPath: ${r.path}` : `Error: ${r.error}`;
        }

        case 'delete_project': {
            const r = deleteProject(args.name || args.project, args.confirm === true);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'switch_workspace': {
            const r = switchWorkspace(args.path || args.dir);
            return r.success ? `${r.message}` : `Error: ${r.error}`;
        }

        // ── Code tools ──
        case 'install_package': {
            const r = await installPackage(args.package_name || args.package, args.manager || 'npm', args.global === true);
            return `${r.message}\n${(r.output || '').slice(0, 2000)}`;
        }

        case 'debug_code': {
            const r = await debugCode(args.code, args.language || 'python', args.error || '');
            return `Status: ${r.message}\nAnalysis: ${r.data?.analysis}\nOutput:\n${(r.output || '').slice(0, 3000)}`;
        }

        case 'apply_patch': {
            const r = await applyPatch(args.patch || args.patch_content, args.file || args.target_file, args.reverse === true);
            return r.success ? r.message! : `Error: ${r.error}\n${(r.output || '').slice(0, 1000)}`;
        }

        // ── File generation ──
        case 'generate_markdown': {
            const r = generateMarkdown(args.content, args.file || args.path || 'output.md');
            return r.success ? `${r.message} (${r.size} bytes)` : `Error: ${r.error}`;
        }

        case 'generate_json': {
            const r = generateJson(args.data, args.file || args.path || 'output.json', args.indent || 2);
            return r.success ? `${r.message} (${r.size} bytes)` : `Error: ${r.error}`;
        }

        case 'generate_csv': {
            const r = generateCsv(args.data, args.file || args.path || 'output.csv', args.delimiter || ',');
            return r.success ? `${r.message} (${r.size} bytes)` : `Error: ${r.error}`;
        }

        case 'generate_html': {
            const r = generateHtml(args.content, args.file || args.path || 'output.html', args.title || 'Generated Page', args.wrap !== false);
            return r.success ? `${r.message} (${r.size} bytes)` : `Error: ${r.error}`;
        }

        case 'generate_pdf': {
            const r = await generatePdf(args.content, args.file || args.path || 'output.pdf', args.title || 'Generated Document', args.from_html === true);
            return r.success ? `${r.message}` : `Error: ${r.error}`;
        }

        case 'generate_zip': return runTool('archive_create_zip', args);

        // ── Agent intelligence ──
        case 'planner_phase': {
            const r = plannerPhase(args.goal, args.steps as string[], args.session_id || 'default');
            return r.success ? `${r.message}\n${JSON.stringify(r.data, null, 2).slice(0, 2000)}` : `Error: ${r.error}`;
        }

        case 'step_tracker': {
            const r = stepTracker(args.action, args.step_index, args.note || '');
            return r.success ? `${r.message || ''}\n${JSON.stringify(r.data, null, 2).slice(0, 1500)}` : `Error: ${r.error}`;
        }

        case 'loop_supervisor': {
            const r = loopSupervisor(args.action || 'tick', args.max_iterations || 30, args.note || '');
            return r.success ? `${r.message}` : `Error: ${r.error} — Stop iterating.`;
        }

        case 'tool_validator': {
            const r = toolValidator(args.tool_name, args.args || {});
            return r.success ? r.message! : `Invalid: ${r.error}`;
        }

        case 'reflection_pass': {
            const r = reflectionPass(args.completed_steps || [], args.goal || '', args.outcome || 'success', args.notes || '');
            return r.success ? String(r.message) : `Error: ${r.error}`;
        }

        case 'memory_store': {
            const r = memoryStore(args.content, args.tag || '');
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'memory_retrieve': {
            const r = memoryRetrieve(args.filter || '');
            if (!r.success) return `Error: ${r.error}`;
            if (!r.data || r.data.length === 0) return 'No memory entries found.';
            return `${r.message}\n` + (r.data as any[]).map((e: any, i: number) => `[${i + 1}] ${e.content}`).join('\n');
        }

        // ── System utilities ──
        case 'get_environment_variables': {
            const r = getEnvironmentVariables(args.filter || '');
            return r.success ? `${r.message}\n${JSON.stringify(r.data, null, 2).slice(0, 3000)}` : `Error: ${r.error}`;
        }

        case 'set_environment_variable': {
            const r = setEnvironmentVariable(args.key || args.name, args.value);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'get_system_info': {
            const r = await getSystemInfo();
            return r.success ? JSON.stringify(r.data, null, 2).slice(0, 3000) : `Error: ${r.error}`;
        }

        case 'check_disk_usage': {
            const r = await checkDiskUsage(args.path || '/');
            return r.success ? String(r.data?.df_output) : `Error: ${r.error}`;
        }

        case 'check_website_status': {
            const r = await checkWebsiteStatus(args.url || args.website, args.timeout || 10);
            return `${r.message}\n${JSON.stringify(r.data, null, 2).slice(0, 500)}`;
        }

        // ── Office documents ──
        case 'generate_docx': {
            let docContent: any;
            if (args.sections) {
                docContent = { title: args.title, sections: args.sections };
            } else if (args.content && typeof args.content === 'object' && args.content.sections) {
                docContent = args.content;
            } else {
                const text = typeof args.content === 'string' ? args.content : JSON.stringify(args.content || args.text || '');
                const lines = text.split('\n');
                const paragraphs = lines.filter((l: string) => l.trim());
                docContent = {
                    title: args.title || 'Document',
                    sections: [{ paragraphs }],
                };
            }
            const r = await generateDocx(docContent, args.file || args.path || 'output.docx');
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'generate_xlsx': {
            let sheets: any[];
            if (args.sheets && Array.isArray(args.sheets)) {
                sheets = args.sheets;
            } else if (args.data && Array.isArray(args.data)) {
                const data = args.data as any[];
                if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
                    const headers = Object.keys(data[0]);
                    const rows = data.map((row: any) => headers.map(h => row[h] ?? null));
                    sheets = [{ name: args.sheet || 'Sheet1', headers, rows }];
                } else {
                    sheets = [{ name: args.sheet || 'Sheet1', rows: data }];
                }
            } else if (args.headers || args.rows) {
                sheets = [{ name: args.sheet || 'Sheet1', headers: args.headers, rows: args.rows || [] }];
            } else {
                sheets = [{ name: 'Sheet1', rows: [] }];
            }
            const r = await generateXlsx(sheets, args.file || args.path || 'output.xlsx');
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        case 'generate_pptx': {
            const rawSlides = args.slides || [];
            const slides = rawSlides.map((s: any) => ({
                title: s.title || 'Slide',
                subtitle: s.subtitle,
                content: typeof s.content === 'string' ? s.content.split('\n').filter(Boolean) : (s.content || undefined),
                bullet_points: s.bullet_points || s.bullets || undefined,
                table: s.table || undefined,
                layout: s.layout || undefined,
            }));
            const r = await generatePptx(slides, args.file || args.path || 'output.pptx', args.theme);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        // ── Places & Maps ──
        case 'places_search': {
            const r = await placesSearch(args.query, args.location, args.category, args.limit || 10);
            if (!r.success) return `Error: ${r.error}`;
            if (!r.data || r.data.length === 0) return `No places found for "${args.query}"`;
            const places = r.data as any[];
            return `${r.message}\n\n` + places.map((p: any, i: number) =>
                `${i + 1}. ${p.name}\n   Type: ${p.type} | Lat: ${p.lat}, Lon: ${p.lon}\n   Address: ${p.display_name}`
            ).join('\n\n').slice(0, MAX_TOOL_RESULT_LEN);
        }

        case 'places_map_display': {
            const r = await placesMapDisplay(args.places || [], {
                title: args.title,
                filePath: args.file || args.path,
                center: args.center,
                zoom: args.zoom,
                itinerary: args.itinerary,
            });
            return r.success ? `${r.message}\nFile: ${r.data?.path}` : `Error: ${r.error}`;
        }

        // ── Weather ──
        case 'weather_fetch': {
            const r = await weatherFetch(args.location || args.city || args.query, args.days || 3);
            if (!r.success) return `Error: ${r.error}`;
            const d = r.data;
            const curr = d.current;
            const forecast = d.forecast || [];
            let out = `Weather: ${curr.location}\n`;
            out += `Now: ${curr.temperature_c}°C (feels ${curr.feels_like_c}°C), ${curr.condition}\n`;
            out += `Humidity: ${curr.humidity_pct}% | Wind: ${curr.wind_kmh} km/h | Precip: ${curr.precipitation_mm}mm\n\n`;
            out += `Forecast (${forecast.length} days):\n`;
            for (const f of forecast) {
                out += `  ${f.date}: ${f.condition}, ${f.temp_min_c}–${f.temp_max_c}°C, rain ${f.precipitation_mm}mm\n`;
            }
            return out.slice(0, MAX_TOOL_RESULT_LEN);
        }

        // ── Sports ──
        case 'fetch_sports_data': {
            const r = await fetchSportsData(args.league, args.type || 'scores');
            if (!r.success) return `Error: ${r.error}`;
            return `${r.message}\n${JSON.stringify(r.data, null, 2).slice(0, MAX_TOOL_RESULT_LEN)}`;
        }

        // ── Message compose ──
        case 'message_compose': {
            const r = messageCompose(args.type || 'email', {
                to: args.to,
                from: args.from,
                subject: args.subject,
                body: args.body || args.content || '',
                tone: args.tone || 'professional',
                channel: args.channel,
                signature: args.signature,
            });
            return r.success ? `${r.message}\n\n---\n${r.data?.message}` : `Error: ${r.error}`;
        }

        // ── Recipe ──
        case 'recipe_display': {
            const r = await recipeDisplay(args.query || args.recipe, {
                servings: args.servings || 1,
                filePath: args.file || args.path,
                format: args.format || 'text',
            });
            if (!r.success) return `Error: ${r.error}`;
            return args.format === 'html'
                ? `${r.message}`
                : r.data?.text || JSON.stringify(r.data?.recipe, null, 2).slice(0, MAX_TOOL_RESULT_LEN);
        }

        // ── str_replace ──
        case 'str_replace': {
            const r = strReplace(
                args.file || args.path,
                args.old_str || args.old || args.find,
                args.new_str !== undefined ? args.new_str : (args.new || args.replace || ''),
                args.occurrences || 'first'
            );
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        // ── present_files ──
        case 'present_files': {
            const r = presentFiles(args.path || args.dir || '.', args.recursive === true);
            return r.success ? r.message! : `Error: ${r.error}`;
        }

        // ── Aliases ──
        case 'web_fetch': return runTool('web_open_url', { ...args, url: args.url || args.path });
        case 'bash_tool': return runTool('shell', { command: args.command || args.bash || args.cmd });
        case 'view': {
            if (args.path && (args.path.endsWith('/') || !args.path.includes('.'))) {
                return runTool('file_list', args);
            }
            return runTool('file_read', args);
        }
        case 'create_file': return runTool('file_write', args);
        case 'image_search': return runTool('search_image_by_text', args);

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
