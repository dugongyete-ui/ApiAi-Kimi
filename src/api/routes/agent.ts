import _ from 'lodash';
import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { createAgentStream } from '@/api/controllers/agent.ts';
import { detectTokenType } from '@/api/controllers/chat-v2.ts';
import { getServerToken, resolveToken } from '@/api/routes/auth.ts';
import logger from '@/lib/logger.ts';

export default {

    prefix: '/v1/agent',

    post: {

        '/completions': async (request: Request) => {
            request
                .validate('body.messages', _.isArray)
                .validate('body.conversation_id', v => _.isUndefined(v) || _.isString(v))

            let authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];

            if (!authHeader || authHeader === 'Bearer' || authHeader.trim() === '') {
                const serverToken = getServerToken();
                if (serverToken) {
                    authHeader = `Bearer ${serverToken}`;
                    logger.info('[Agent] Using server-saved token');
                } else {
                    throw new Error('No token provided. Save a Kimi Auth token via POST /auth/save or provide Authorization header.');
                }
            }

            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const token = resolveToken(rawToken);

            if (!token) {
                throw new Error('Invalid API key or token. Check your API key via GET /auth/apikey');
            }

            if (detectTokenType(token) !== 'jwt') {
                throw new Error('Agent mode requires JWT token (kimi-auth cookie). Refresh token is not supported for agent mode.');
            }

            const { model = 'kimi', messages, conversation_id: convId } = request.body;

            logger.info(`[Agent] Starting agent, model: ${model}, messages: ${messages.length}`);

            const agentStream = await createAgentStream(model, messages, token, convId);

            return new Response(agentStream, {
                type: 'text/event-stream',
            });
        },

        '/run': async (request: Request) => {
            request
                .validate('body.task', _.isString)

            let authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];

            if (!authHeader || authHeader === 'Bearer' || authHeader.trim() === '') {
                const serverToken = getServerToken();
                if (serverToken) {
                    authHeader = `Bearer ${serverToken}`;
                } else {
                    throw new Error('No token provided.');
                }
            }

            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const token = resolveToken(rawToken);

            if (!token) {
                throw new Error('Invalid API key or token.');
            }

            const { model = 'kimi', task, context } = request.body;

            const messages: any[] = [];
            if (context) {
                messages.push({ role: 'system', content: String(context) });
            }
            messages.push({ role: 'user', content: String(task) });

            logger.info(`[Agent] Running task: ${task.slice(0, 80)}`);

            const agentStream = await createAgentStream(model, messages, token);

            return new Response(agentStream, {
                type: 'text/event-stream',
            });
        }

    },

    get: {

        '/tools': async () => {
            return {
                tools: [
                    {
                        name: 'shell',
                        description: 'Execute any terminal/bash command on the server',
                        arguments: { command: 'string — the shell command to execute' },
                        example: { name: 'shell', arguments: { command: 'ls -la && pwd' } },
                    },
                    {
                        name: 'browser',
                        description: 'Visit a URL and extract readable text content',
                        arguments: { url: 'string — the URL to visit' },
                        example: { name: 'browser', arguments: { url: 'https://example.com' } },
                    },
                    {
                        name: 'web_search',
                        description: 'Search the web using DuckDuckGo',
                        arguments: { query: 'string — search query' },
                        example: { name: 'web_search', arguments: { query: 'latest AI news 2025' } },
                    },
                    {
                        name: 'file_read',
                        description: 'Read a file from the agent workspace',
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
                        name: 'message',
                        description: 'Send a status update or message to the user',
                        arguments: { content: 'string — message content' },
                        example: { name: 'message', arguments: { content: 'Starting web search...' } },
                    },
                ],
                endpoints: {
                    '/v1/agent/completions': 'POST — OpenAI-compatible chat with agent tools (streaming SSE)',
                    '/v1/agent/run': 'POST — Simple task runner: { task: string, context?: string }',
                    '/v1/agent/tools': 'GET — List all available tools',
                },
                notes: [
                    'All requests use the same API key: Authorization: Bearer sk-kimi-xxxx',
                    'Responses are streamed as SSE events',
                    'SSE event types: agent_start, tool_call, tool_result, agent_done, agent_error, agent_limit',
                    'Standard OpenAI chat.completion.chunk events are also included for final content',
                    'Shell commands run in real Linux environment',
                    'Files are stored in the agent-workspace/ directory',
                ],
            };
        }

    }

};
