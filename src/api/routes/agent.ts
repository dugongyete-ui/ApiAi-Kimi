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

    // ── BASIC CODING AGENT (CORE) ──
    {
        name: 'read_file',
        description: 'Read a file from the agent workspace (alias for file_read)',
        arguments: { path: 'string — file path' },
        example: { name: 'read_file', arguments: { path: 'notes.txt' } },
    },
    {
        name: 'write_file',
        description: 'Write/overwrite a file (alias for file_write)',
        arguments: { path: 'string', content: 'string' },
        example: { name: 'write_file', arguments: { path: 'output.txt', content: 'Hello!' } },
    },
    {
        name: 'list_directory',
        description: 'List files/directories in the workspace (alias for file_list)',
        arguments: { path: 'string (optional)' },
        example: { name: 'list_directory', arguments: { path: '.' } },
    },
    {
        name: 'create_directory',
        description: 'Create a new directory (and any missing parent directories)',
        arguments: { path: 'string — directory path to create', recursive: 'boolean (optional, default true)' },
        example: { name: 'create_directory', arguments: { path: 'my-project/src/utils' } },
    },
    {
        name: 'delete_file',
        description: 'Delete a file or directory (alias for file_delete)',
        arguments: { path: 'string' },
        example: { name: 'delete_file', arguments: { path: 'temp.txt' } },
    },
    {
        name: 'move_file',
        description: 'Move or rename a file/directory',
        arguments: { src: 'string — source path', dest: 'string — destination path' },
        example: { name: 'move_file', arguments: { src: 'draft.txt', dest: 'final/report.txt' } },
    },
    {
        name: 'copy_file',
        description: 'Copy a file to a new location',
        arguments: { src: 'string — source path', dest: 'string — destination path' },
        example: { name: 'copy_file', arguments: { src: 'template.html', dest: 'pages/about.html' } },
    },

    // ── CODE EXECUTION & DEBUGGING ──
    {
        name: 'run_code',
        description: 'Run code in Python, JavaScript, TypeScript, Bash, or Ruby (alias for code_execute)',
        arguments: { language: 'string — python|javascript|typescript|bash|ruby', code: 'string' },
        example: { name: 'run_code', arguments: { language: 'python', code: "print('hello')" } },
    },
    {
        name: 'run_shell',
        description: 'Execute a shell command (alias for shell)',
        arguments: { command: 'string' },
        example: { name: 'run_shell', arguments: { command: 'ls -la' } },
    },
    {
        name: 'install_package',
        description: 'Install a package using npm, pip, or yarn',
        arguments: {
            package_name: 'string — package name (e.g. "requests", "axios")',
            manager: 'string (optional) — npm|pip|pip3|yarn, default "npm"',
            global: 'boolean (optional) — install globally, default false',
        },
        example: { name: 'install_package', arguments: { package_name: 'requests', manager: 'pip' } },
    },
    {
        name: 'debug_code',
        description: 'Run code and analyze any errors, returning error type, analysis, and suggestions for fixing',
        arguments: {
            code: 'string — code to debug',
            language: 'string (optional) — python|javascript|typescript|bash, default "python"',
            error: 'string (optional) — known error message to analyze',
        },
        example: { name: 'debug_code', arguments: { language: 'python', code: "import pandas\ndf = pandas.read_csv('data.csv')" } },
    },
    {
        name: 'apply_patch',
        description: 'Apply a unified diff patch to a file or the current working directory',
        arguments: {
            patch: 'string — unified diff patch content',
            file: 'string (optional) — target file path (if patching a single file)',
            reverse: 'boolean (optional) — apply patch in reverse, default false',
        },
        example: { name: 'apply_patch', arguments: { patch: '--- a/file.py\n+++ b/file.py\n@@ -1 +1 @@\n-old\n+new' } },
    },

    // ── PROJECT & WORKSPACE MANAGEMENT ──
    {
        name: 'create_project',
        description: 'Scaffold a new project directory with boilerplate files',
        arguments: {
            name: 'string — project name (becomes directory name)',
            template: 'string (optional) — node|python|web|blank, default "blank"',
        },
        example: { name: 'create_project', arguments: { name: 'my-api', template: 'node' } },
    },
    {
        name: 'delete_project',
        description: 'Delete an entire project directory (requires confirm=true as safety check)',
        arguments: { name: 'string — project/directory name', confirm: 'boolean — must be true to proceed' },
        example: { name: 'delete_project', arguments: { name: 'old-project', confirm: true } },
    },
    {
        name: 'switch_workspace',
        description: 'Set the working context to a subdirectory in the agent workspace',
        arguments: { path: 'string — path relative to agent-workspace' },
        example: { name: 'switch_workspace', arguments: { path: 'my-project' } },
    },
    {
        name: 'get_project_structure',
        description: 'Get a tree view of a project or directory structure',
        arguments: {
            path: 'string (optional) — starting directory, default "."',
            max_depth: 'number (optional) — maximum depth to traverse, default 4',
        },
        example: { name: 'get_project_structure', arguments: { path: '.', max_depth: 3 } },
    },
    {
        name: 'search_in_files',
        description: 'Search for a text pattern across all files in a directory (like grep -rn)',
        arguments: {
            query: 'string — search text or pattern (case-insensitive)',
            path: 'string (optional) — directory to search in, default "."',
            glob: 'string (optional) — file pattern filter, e.g. "*.py" or "*.ts"',
        },
        example: { name: 'search_in_files', arguments: { query: 'def main', path: '.', glob: '*.py' } },
    },

    // ── WEB & NETWORK ──
    {
        name: 'fetch_url_content',
        description: 'Fetch and extract text content from a URL (alias for web_open_url)',
        arguments: { url: 'string — URL to fetch' },
        example: { name: 'fetch_url_content', arguments: { url: 'https://example.com' } },
    },
    {
        name: 'check_website_status',
        description: 'Check if a website is up and measure response time — returns HTTP status code and latency',
        arguments: {
            url: 'string — website URL (e.g. "https://google.com")',
            timeout: 'number (optional) — timeout in seconds, default 10',
        },
        example: { name: 'check_website_status', arguments: { url: 'https://google.com' } },
    },

    // ── FILE GENERATION ──
    {
        name: 'generate_pdf',
        description: 'Generate a PDF file from text or HTML content (uses headless browser rendering)',
        arguments: {
            content: 'string — text or HTML content',
            file: 'string (optional) — output file path, default "output.pdf"',
            title: 'string (optional) — document title',
            from_html: 'boolean (optional) — treat content as raw HTML, default false',
        },
        example: { name: 'generate_pdf', arguments: { content: 'Hello World\nThis is my first PDF.', file: 'report.pdf', title: 'My Report' } },
    },
    {
        name: 'generate_markdown',
        description: 'Write content to a Markdown (.md) file',
        arguments: { content: 'string — markdown content', file: 'string (optional) — output path, default "output.md"' },
        example: { name: 'generate_markdown', arguments: { content: '# Hello\n\nContent here.', file: 'notes.md' } },
    },
    {
        name: 'generate_zip',
        description: 'Create a ZIP archive from files/folders (alias for archive_create_zip)',
        arguments: { path: 'string — output zip path', sources: 'array — files/folders to archive' },
        example: { name: 'generate_zip', arguments: { path: 'output.zip', sources: ['file1.txt'] } },
    },
    {
        name: 'generate_json',
        description: 'Save data as a formatted JSON file',
        arguments: { data: 'any — data to serialize (object, array, string)', file: 'string (optional) — output path', indent: 'number (optional) — indent spaces, default 2' },
        example: { name: 'generate_json', arguments: { data: { name: 'test', score: 42 }, file: 'result.json' } },
    },
    {
        name: 'generate_csv',
        description: 'Generate a CSV file from an array of objects or 2D array',
        arguments: {
            data: 'array — array of objects (uses keys as headers) or array of arrays',
            file: 'string (optional) — output file path, default "output.csv"',
            delimiter: 'string (optional) — column delimiter, default ","',
        },
        example: { name: 'generate_csv', arguments: { data: [{ name: 'Alice', score: 95 }, { name: 'Bob', score: 87 }], file: 'scores.csv' } },
    },
    {
        name: 'generate_html',
        description: 'Generate an HTML file with optional full page wrapper (includes basic responsive CSS)',
        arguments: {
            content: 'string — HTML body content or full HTML document',
            file: 'string (optional) — output path, default "output.html"',
            title: 'string (optional) — page title',
            wrap: 'boolean (optional) — wrap with full HTML structure, default true',
        },
        example: { name: 'generate_html', arguments: { content: '<h1>Hello</h1><p>World</p>', file: 'index.html', title: 'My Page' } },
    },

    // ── AGENT INTELLIGENCE LAYER ──
    {
        name: 'planner_phase',
        description: 'Create a structured plan with numbered steps for a complex goal — tracks state across tool calls',
        arguments: {
            goal: 'string — the main objective',
            steps: 'array of strings — ordered list of steps to complete the goal',
            session_id: 'string (optional) — session identifier, default "default"',
        },
        example: { name: 'planner_phase', arguments: { goal: 'Build a web scraper', steps: ['Install dependencies', 'Write scraper code', 'Test scraper', 'Export results'] } },
    },
    {
        name: 'step_tracker',
        description: 'Track progress of plan steps — mark steps as started, completed, or failed; or get current status',
        arguments: {
            action: 'string — start|complete|fail|status',
            step_index: 'number (required for start/complete/fail) — step number (1-based)',
            note: 'string (optional) — additional note about the step',
        },
        example: { name: 'step_tracker', arguments: { action: 'complete', step_index: 1, note: 'requests installed successfully' } },
    },
    {
        name: 'loop_supervisor',
        description: 'Monitor iteration budget to prevent infinite loops — tick on each iteration, stops when max_iterations reached',
        arguments: {
            action: 'string — init|tick|reset|status',
            max_iterations: 'number (optional, for init) — max allowed iterations, default 30',
            note: 'string (optional) — label for this iteration',
        },
        example: { name: 'loop_supervisor', arguments: { action: 'tick', note: 'Processing item 5' } },
    },
    {
        name: 'tool_validator',
        description: 'Validate tool call arguments before executing — check required fields are present',
        arguments: {
            tool_name: 'string — name of the tool to validate',
            args: 'object — the arguments you plan to pass to the tool',
        },
        example: { name: 'tool_validator', arguments: { tool_name: 'file_write', args: { path: 'out.txt' } } },
    },
    {
        name: 'reflection_pass',
        description: 'Generate a structured reflection on completed work — summarizes outcome, lessons learned, and next steps',
        arguments: {
            goal: 'string — what was attempted',
            completed_steps: 'array of strings — steps that were completed',
            outcome: 'string — success|partial|failed',
            notes: 'string (optional) — additional observations',
        },
        example: { name: 'reflection_pass', arguments: { goal: 'Scrape news data', completed_steps: ['Search done', 'Data saved'], outcome: 'success' } },
    },
    {
        name: 'memory_store',
        description: 'Save information to persistent memory with optional tag (shortcut for memory_space_edits add)',
        arguments: { content: 'string — content to remember', tag: 'string (optional) — category tag' },
        example: { name: 'memory_store', arguments: { content: 'User prefers Python over JavaScript', tag: 'preference' } },
    },
    {
        name: 'memory_retrieve',
        description: 'Retrieve stored memories, optionally filtered by keyword (shortcut for memory_space_edits list)',
        arguments: { filter: 'string (optional) — keyword to filter memories' },
        example: { name: 'memory_retrieve', arguments: { filter: 'preference' } },
    },

    // ── SYSTEM UTILITIES ──
    {
        name: 'get_environment_variables',
        description: 'Read environment variables — sensitive values (API keys, tokens, passwords) are redacted automatically',
        arguments: { filter: 'string (optional) — keyword to filter variable names' },
        example: { name: 'get_environment_variables', arguments: { filter: 'NODE' } },
    },
    {
        name: 'set_environment_variable',
        description: 'Set an environment variable for the current session (not persisted to disk)',
        arguments: { key: 'string — variable name', value: 'string — variable value' },
        example: { name: 'set_environment_variable', arguments: { key: 'DEBUG', value: 'true' } },
    },
    {
        name: 'get_system_info',
        description: 'Get system information: OS, CPU, memory usage, Node.js version, disk, and shell environment',
        arguments: {},
        example: { name: 'get_system_info', arguments: {} },
    },
    {
        name: 'check_disk_usage',
        description: 'Check disk space usage for a path',
        arguments: { path: 'string (optional) — directory to check, default "/"' },
        example: { name: 'check_disk_usage', arguments: { path: '/' } },
    },

    // ── BROWSER (HTML content) ──
    {
        name: 'browser_get_html',
        description: 'Get the raw HTML source of the current page or a specific element',
        arguments: { selector: 'string (optional) — CSS selector, returns full page HTML if omitted' },
        example: { name: 'browser_get_html', arguments: { selector: '#main' } },
    },

    // ── OFFICE DOCUMENT GENERATION ──
    {
        name: 'generate_docx',
        description: 'Generate a Microsoft Word (.docx) document. Supports simple text string OR structured sections.',
        arguments: {
            content: 'string — plain text or markdown content (simple mode)',
            title: 'string (optional) — document title',
            sections: 'array (optional, advanced) — structured sections: [{ heading, heading_level, paragraphs, bullet_list, table }]',
            file: 'string (optional) — output file path, default "output.docx"',
        },
        example: { name: 'generate_docx', arguments: { title: 'My Report', content: '# Introduction\n\nThis is my report.\n\n- Point 1\n- Point 2', file: 'report.docx' } },
    },
    {
        name: 'generate_xlsx',
        description: 'Generate a Microsoft Excel (.xlsx) spreadsheet. Pass data as array of objects, or use sheets for multi-sheet.',
        arguments: {
            data: 'array of objects — keys become column headers, values become rows (simple mode)',
            sheet: 'string (optional) — sheet name, default "Sheet1"',
            headers: 'array of strings (optional) — explicit column headers',
            rows: 'array of arrays (optional) — data rows when using headers',
            sheets: 'array (optional, advanced) — multi-sheet: [{ name, headers, rows, column_widths }]',
            file: 'string (optional) — output file path, default "output.xlsx"',
        },
        example: { name: 'generate_xlsx', arguments: { data: [{ name: 'Alice', score: 95 }, { name: 'Bob', score: 87 }], file: 'scores.xlsx' } },
    },
    {
        name: 'generate_pptx',
        description: 'Generate a Microsoft PowerPoint (.pptx) presentation from an array of slides',
        arguments: {
            slides: 'array — each slide: { title: string, subtitle?: string, content?: string | string[], bullet_points?: string[], table?: {headers, rows} }',
            file: 'string (optional) — output file path, default "output.pptx"',
            theme: 'object (optional) — { accent: "hex-color", background: "hex-color" }',
        },
        example: { name: 'generate_pptx', arguments: { slides: [{ title: 'My Presentation', subtitle: 'By Kimi Agent' }, { title: 'Overview', bullet_points: ['Point 1', 'Point 2', 'Point 3'] }], file: 'slides.pptx' } },
    },

    // ── GEO & WEATHER ──
    {
        name: 'places_search',
        description: 'Search for places, businesses, or locations using a query (returns name, address, coordinates)',
        arguments: {
            query: 'string — search query (e.g. "coffee shops in Tokyo")',
            limit: 'number (optional) — max results, default 5',
        },
        example: { name: 'places_search', arguments: { query: 'restaurants near Shibuya Tokyo', limit: 5 } },
    },
    {
        name: 'places_map_display',
        description: 'Generate a map display URL for a location or coordinates',
        arguments: {
            query: 'string (optional) — place name or address',
            lat: 'number (optional) — latitude',
            lon: 'number (optional) — longitude',
            zoom: 'number (optional) — zoom level 1-20, default 14',
        },
        example: { name: 'places_map_display', arguments: { query: 'Eiffel Tower, Paris' } },
    },
    {
        name: 'weather_fetch',
        description: 'Get current weather and forecast for a location',
        arguments: {
            location: 'string — city name, address, or "lat,lon" coordinates',
            units: 'string (optional) — metric|imperial|kelvin, default "metric"',
            days: 'number (optional) — forecast days (1-7), default 3',
        },
        example: { name: 'weather_fetch', arguments: { location: 'Tokyo', units: 'metric', days: 3 } },
    },

    // ── SPECIALIZED ──
    {
        name: 'fetch_sports_data',
        description: 'Fetch live or recent sports data including scores, standings, and match results',
        arguments: {
            sport: 'string — football|basketball|tennis|baseball|cricket|rugby',
            query: 'string — team name, league, or tournament',
            type: 'string (optional) — scores|standings|fixtures|results, default "scores"',
        },
        example: { name: 'fetch_sports_data', arguments: { sport: 'football', query: 'Premier League', type: 'standings' } },
    },
    {
        name: 'str_replace',
        description: 'Find and replace text within a file (exact string match)',
        arguments: {
            path: 'string — file path in agent workspace',
            old_str: 'string — exact text to find',
            new_str: 'string — replacement text',
        },
        example: { name: 'str_replace', arguments: { path: 'index.html', old_str: '<title>Old</title>', new_str: '<title>New</title>' } },
    },
    {
        name: 'present_files',
        description: 'Present one or more files as downloadable output to the user — renders a summary with file names and sizes',
        arguments: {
            files: 'array of strings — file paths relative to agent workspace',
            message: 'string (optional) — accompanying message to display',
        },
        example: { name: 'present_files', arguments: { files: ['report.pdf', 'data.csv'], message: 'Here are your generated files' } },
    },
    {
        name: 'message_compose',
        description: 'Compose a structured message (email, SMS, notification) with subject and body',
        arguments: {
            type: 'string — email|sms|notification',
            to: 'string — recipient',
            subject: 'string (optional) — subject line (for email)',
            body: 'string — message body',
        },
        example: { name: 'message_compose', arguments: { type: 'email', to: 'user@example.com', subject: 'Report Ready', body: 'Your report has been generated.' } },
    },
    {
        name: 'recipe_display',
        description: 'Search for and display a recipe with ingredients and steps',
        arguments: {
            query: 'string — dish name or ingredient-based search',
            dietary: 'string (optional) — vegetarian|vegan|gluten-free|keto|paleo',
        },
        example: { name: 'recipe_display', arguments: { query: 'chocolate chip cookies', dietary: 'vegetarian' } },
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

    get: {

        /**
         * GET /v1/agent/tools
         * Returns the full list of available agent tools with descriptions and examples.
         */
        '/tools': async (_request: Request) => {
            return {
                object: 'agent.tools',
                count: TOOLS_LIST.length,
                tools: TOOLS_LIST,
                usage: {
                    list_tools_get:  'GET  /v1/agent/tools',
                    list_tools_post: 'POST /v1/agent/completions  { "list_tools": true }',
                    run_task:        'POST /v1/agent/completions  { "task": "...", "model": "kimi" }',
                    chat:            'POST /v1/agent/completions  { "messages": [...], "model": "kimi" }',
                },
                notes: [
                    'All agent requests use: Authorization: Bearer <your-api-key>',
                    'Responses stream as Server-Sent Events (SSE)',
                    'SSE event types: agent_start, tool_call, tool_result, agent_done, agent_error, agent_limit',
                    'Standard OpenAI chat.completion.chunk events included for final content',
                    'Shell commands run in a real Linux environment',
                    'Files are stored in agent-workspace/ directory',
                    `Max iterations per agent run: ${30}`,
                ],
            };
        },

    },

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
