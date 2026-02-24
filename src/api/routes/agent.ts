import _ from 'lodash';
import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { createAgentStream } from '@/api/controllers/agent.ts';
import { detectTokenType } from '@/api/controllers/chat-v2.ts';
import { getServerToken, resolveToken } from '@/api/routes/auth.ts';
import logger from '@/lib/logger.ts';

const TOOLS_LIST = [
    {
        name: 'shell',
        description: 'Execute any terminal/bash command on the server',
        arguments: { command: 'string — the shell command to execute' },
        example: { name: 'shell', arguments: { command: 'ls -la && pwd' } },
    },
    {
        name: 'web_open_url',
        description: 'Open a specific URL and extract readable text content (like Kimi\'s web_open_url)',
        arguments: { url: 'string — full URL to open and read' },
        example: { name: 'web_open_url', arguments: { url: 'https://example.com' } },
    },
    {
        name: 'web_search',
        description: 'Search the web using DuckDuckGo + Brave and return results',
        arguments: { query: 'string — search query, supports site:, "exact", after:YYYY-MM-DD operators' },
        example: { name: 'web_search', arguments: { query: 'AI news after:2025-01-01' } },
    },
    {
        name: 'search_image_by_text',
        description: 'Search for images by text description — returns image URLs, thumbnails, and source links',
        arguments: { query: 'string — image description', limit: 'number (optional, max 10, default 8)' },
        example: { name: 'search_image_by_text', arguments: { query: 'golden gate bridge sunset', limit: 5 } },
    },
    {
        name: 'search_image_by_image',
        description: 'Reverse image search — find similar images by providing an image URL',
        arguments: { image_url: 'string — URL of the source image', limit: 'number (optional, default 6)' },
        example: { name: 'search_image_by_image', arguments: { image_url: 'https://example.com/photo.jpg' } },
    },
    {
        name: 'get_datasource_desc',
        description: 'Get description, parameters, and examples for a data source (or list all available sources)',
        arguments: { source: 'string (optional) — source name: yahoo_finance | binance_crypto | world_bank_open_data | arxiv | google_scholar' },
        example: { name: 'get_datasource_desc', arguments: { source: 'yahoo_finance' } },
    },
    {
        name: 'get_data_source',
        description: 'Fetch structured data from named sources: yahoo_finance (stocks/ETF/crypto), binance_crypto (real-time crypto), world_bank_open_data (GDP/population/economic), arxiv (scientific papers), google_scholar (academic literature)',
        arguments: {
            source: 'string — source name (required)',
            query: 'string — ticker/search term/country code',
            type: 'string — data type (quote|history|search|news for yahoo; price|ticker24h|klines for binance; indicator|country for world_bank; search|paper for arxiv; search|paper|author for scholar)',
            period: 'string (yahoo history) — 1d|5d|1mo|3mo|1y|5y|max',
            interval: 'string (yahoo/binance klines) — 1m|5m|1h|1d|1wk',
            indicator: 'string (world_bank) — e.g. NY.GDP.MKTP.CD',
            max_results: 'number (arxiv) — max papers to return',
            limit: 'number (scholar) — max results',
            year: 'string (scholar) — e.g. "2020-2024"',
        },
        example: { name: 'get_data_source', arguments: { source: 'yahoo_finance', query: 'TSLA', type: 'quote' } },
    },
    {
        name: 'memory_space_edits',
        description: 'Manage persistent memory across agent sessions — add, replace, remove, or list remembered information',
        arguments: {
            action: 'string — add | replace | remove | list | clear',
            content: 'string — content to save (for add/replace)',
            id: 'string — memory entry id (for replace/remove)',
            old_content: 'string — partial content to find (alternative to id for replace/remove)',
        },
        example: { name: 'memory_space_edits', arguments: { action: 'add', content: 'User prefers dark mode' } },
    },
    {
        name: 'browser',
        description: 'Visit a URL and extract readable text content (fast HTML fetch)',
        arguments: { url: 'string — the URL to visit' },
        example: { name: 'browser', arguments: { url: 'https://example.com' } },
    },
    {
        name: 'browser_navigate',
        description: 'Navigate to URL in a live Playwright browser session (for JS-heavy sites)',
        arguments: { url: 'string — the URL to navigate to' },
        example: { name: 'browser_navigate', arguments: { url: 'https://example.com' } },
    },
    {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current page or a URL',
        arguments: { url: 'string (optional)', selector: 'string (optional) — CSS selector' },
        example: { name: 'browser_screenshot', arguments: { url: 'https://example.com' } },
    },
    {
        name: 'browser_click',
        description: 'Click an element by CSS selector in the live browser',
        arguments: { selector: 'string — CSS selector' },
        example: { name: 'browser_click', arguments: { selector: 'button.submit' } },
    },
    {
        name: 'browser_type',
        description: 'Type text into an input field in the live browser',
        arguments: { selector: 'string', text: 'string', clear: 'boolean (optional, default true)' },
        example: { name: 'browser_type', arguments: { selector: 'input[name=q]', text: 'hello world', clear: true } },
    },
    {
        name: 'browser_scroll',
        description: 'Scroll the page in the live browser',
        arguments: { direction: 'string — up|down', amount: 'number — pixels' },
        example: { name: 'browser_scroll', arguments: { direction: 'down', amount: 500 } },
    },
    {
        name: 'browser_get_text',
        description: 'Get visible text content from the current page or an element',
        arguments: { selector: 'string (optional) — CSS selector' },
        example: { name: 'browser_get_text', arguments: { selector: null } },
    },
    {
        name: 'browser_eval',
        description: 'Execute JavaScript in the live browser and return result',
        arguments: { code: 'string — JS code to evaluate' },
        example: { name: 'browser_eval', arguments: { code: 'document.title' } },
    },
    {
        name: 'http_request',
        description: 'Make HTTP requests to any REST API',
        arguments: { method: 'string', url: 'string', headers: 'object (optional)', body: 'object (optional)', timeout: 'number (optional)' },
        example: { name: 'http_request', arguments: { method: 'GET', url: 'https://api.example.com/data' } },
    },
    {
        name: 'code_execute',
        description: 'Run code in Python, JavaScript, TypeScript, Bash, or Ruby',
        arguments: { language: 'string — python|javascript|typescript|bash|ruby', code: 'string' },
        example: { name: 'code_execute', arguments: { language: 'python', code: "print('hello')" } },
    },
    {
        name: 'file_read',
        description: 'Read a file from the agent workspace (agent-workspace/)',
        arguments: { path: 'string — relative path to the file' },
        example: { name: 'file_read', arguments: { path: 'notes.txt' } },
    },
    {
        name: 'file_write',
        description: 'Write/overwrite a file in the agent workspace',
        arguments: { path: 'string — file path', content: 'string — file content' },
        example: { name: 'file_write', arguments: { path: 'output.txt', content: 'Hello!' } },
    },
    {
        name: 'file_append',
        description: 'Append content to a file in the agent workspace',
        arguments: { path: 'string — file path', content: 'string — content to append' },
        example: { name: 'file_append', arguments: { path: 'log.txt', content: 'new entry\n' } },
    },
    {
        name: 'file_list',
        description: 'List files and directories in the agent workspace',
        arguments: { path: 'string (optional) — directory path, default "."' },
        example: { name: 'file_list', arguments: { path: '.' } },
    },
    {
        name: 'file_delete',
        description: 'Delete a file or directory from the agent workspace',
        arguments: { path: 'string — file or directory path' },
        example: { name: 'file_delete', arguments: { path: 'temp.txt' } },
    },
    {
        name: 'archive_create_zip',
        description: 'Create a ZIP archive from files/folders',
        arguments: { path: 'string — output zip path', sources: 'array — list of files/folders to include' },
        example: { name: 'archive_create_zip', arguments: { path: 'output.zip', sources: ['file1.txt', 'folder/'] } },
    },
    {
        name: 'archive_extract_zip',
        description: 'Extract a ZIP archive to a destination directory',
        arguments: { path: 'string — zip file path', dest: 'string (optional) — destination directory' },
        example: { name: 'archive_extract_zip', arguments: { path: 'archive.zip', dest: 'output_dir/' } },
    },
    {
        name: 'archive_create_tar',
        description: 'Create a TAR.GZ archive',
        arguments: { path: 'string — output tar.gz path', sources: 'array — list of files/folders' },
        example: { name: 'archive_create_tar', arguments: { path: 'output.tar.gz', sources: ['file1.txt'] } },
    },
    {
        name: 'archive_extract_tar',
        description: 'Extract a TAR or TAR.GZ archive',
        arguments: { path: 'string — archive path', dest: 'string (optional) — destination directory' },
        example: { name: 'archive_extract_tar', arguments: { path: 'archive.tar.gz', dest: 'output_dir/' } },
    },
    {
        name: 'archive_list',
        description: 'List contents of a ZIP or TAR archive without extracting',
        arguments: { path: 'string — archive file path' },
        example: { name: 'archive_list', arguments: { path: 'archive.zip' } },
    },
    {
        name: 'message',
        description: 'Send a status update or progress message to the user',
        arguments: { content: 'string — message content' },
        example: { name: 'message', arguments: { content: 'Starting web search...' } },
    },
];

function resolveAuth(request: Request): string {
    let authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];

    if (!authHeader || authHeader === 'Bearer' || String(authHeader).trim() === '') {
        const serverToken = getServerToken();
        if (serverToken) {
            authHeader = `Bearer ${serverToken}`;
            logger.info('[Agent] Using server-saved token');
        } else {
            throw new Error('No token provided. Save a Kimi Auth token via POST /auth/save or provide Authorization header.');
        }
    }

    const rawToken = String(authHeader).replace(/^Bearer\s+/i, '').trim();
    const token = resolveToken(rawToken);

    if (!token) {
        throw new Error('Invalid API key or token. Check your API key via GET /auth/apikey');
    }

    if (detectTokenType(token) !== 'jwt') {
        throw new Error('Agent mode requires JWT token (kimi-auth cookie). Refresh token is not supported for agent mode.');
    }

    return token;
}

export default {

    prefix: '/v1/agent',

    post: {

        /**
         * Unified agent endpoint. Supports three usage modes in a single POST:
         *
         *  Mode 1 — List available tools (no auth needed):
         *    { "list_tools": true }
         *
         *  Mode 2 — Simple task runner (provide a task string):
         *    { "task": "search the web for AI news", "context": "optional system prompt", "model": "kimi" }
         *
         *  Mode 3 — Full OpenAI-compatible chat with agent tools (streaming SSE):
         *    { "messages": [...], "model": "kimi", "conversation_id": "optional" }
         */
        '/completions': async (request: Request) => {
            const body = request.body || {};

            // ── Mode 1: list tools ──────────────────────────────────────────────
            if (body.list_tools === true) {
                return {
                    object: 'agent.tools',
                    tools: TOOLS_LIST,
                    usage: {
                        list_tools: 'POST /v1/agent/completions  { "list_tools": true }',
                        run_task:   'POST /v1/agent/completions  { "task": "...", "context": "...", "model": "kimi" }',
                        chat:       'POST /v1/agent/completions  { "messages": [...], "model": "kimi", "conversation_id": "..." }',
                    },
                    notes: [
                        'All agent requests use: Authorization: Bearer <your-api-key>',
                        'Responses stream as Server-Sent Events (SSE)',
                        'SSE event types: agent_start, tool_call, tool_result, agent_done, agent_error, agent_limit',
                        'Standard OpenAI chat.completion.chunk events included for final content',
                        'Shell commands run in a real Linux environment',
                        'Files are stored in agent-workspace/ directory',
                        'Max iterations per agent run: 30',
                    ],
                };
            }

            // ── Mode 2: simple task runner ─────────────────────────────────────
            if (_.isString(body.task)) {
                const token = resolveAuth(request);
                const { model = 'kimi', task, context } = body;

                const messages: any[] = [];
                if (context) {
                    messages.push({ role: 'system', content: String(context) });
                }
                messages.push({ role: 'user', content: String(task) });

                logger.info(`[Agent] Task mode: ${String(task).slice(0, 80)}`);

                const agentStream = await createAgentStream(model, messages, token);

                return new Response(agentStream, { type: 'text/event-stream' });
            }

            // ── Mode 3: messages array (OpenAI-style) ──────────────────────────
            if (_.isArray(body.messages)) {
                request
                    .validate('body.messages', _.isArray)
                    .validate('body.conversation_id', v => _.isUndefined(v) || _.isString(v));

                const token = resolveAuth(request);
                const { model = 'kimi', messages, conversation_id: convId } = body;

                logger.info(`[Agent] Chat mode, model: ${model}, messages: ${messages.length}`);

                const agentStream = await createAgentStream(model, messages, token, convId);

                return new Response(agentStream, { type: 'text/event-stream' });
            }

            // ── No valid mode detected ─────────────────────────────────────────
            throw new Error(
                'Invalid request body. Use one of:\n' +
                '  { "list_tools": true }  — list all available tools\n' +
                '  { "task": "..." }       — run a task (simple mode)\n' +
                '  { "messages": [...] }   — OpenAI-compatible chat with agent tools'
            );
        },

    },

};
