import _ from 'lodash';
import { PassThrough } from 'stream';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import chat from '@/api/controllers/chat.ts';
import { createCompletionV2, createCompletionStreamV2, detectTokenType } from '@/api/controllers/chat-v2.ts';
import { getServerToken, resolveToken } from '@/api/routes/auth.ts';
import logger from '@/lib/logger.ts';
import {
    transformMessagesForToolBridge,
    parseToolCallsFromText,
    formatToolCallsResponse,
    formatNormalResponse,
    buildToolCallsStream,
    type OpenAITool,
} from '@/api/controllers/tool-bridge.ts';
import util from '@/lib/util.ts';

export default {

    prefix: '/v1/chat',

    post: {

        '/completions': async (request: Request) => {
            request
                .validate('body.conversation_id', v => _.isUndefined(v) || _.isString(v))
                .validate('body.messages', _.isArray)

            let authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];

            if (!authHeader || authHeader === 'Bearer' || authHeader.trim() === '') {
                const serverToken = getServerToken();
                if (serverToken) {
                    authHeader = `Bearer ${serverToken}`;
                    logger.info('Using server-saved token for request');
                } else {
                    throw new Error('No token provided. Please save a Kimi Auth token first via POST /auth/save or provide Authorization header.');
                }
            }

            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const token = resolveToken(rawToken);

            if (!token) {
                throw new Error('Invalid API key or token. Check your API key via GET /auth/apikey');
            }

            const tokenType = detectTokenType(token);

            let { model, conversation_id: convId, messages, stream, use_search, tools, tool_choice } = request.body;

            if (use_search)
                model = 'kimi-search';

            // ── Tool-calling bridge ──────────────────────────────────────────────────
            // Skip bridge if tool_choice is explicitly "none"
            const hasTools = Array.isArray(tools) && tools.length > 0 && tool_choice !== 'none';

            if (hasTools) {
                logger.info(`[ToolBridge] Tool-calling request detected. Tools: ${tools.map((t: OpenAITool) => t?.function?.name).join(', ')}`);

                // Transform messages: inject tools system-prompt, convert role:"tool" → user messages
                const bridgedMessages = transformMessagesForToolBridge(messages, tools as OpenAITool[]);

                // Collect the complete Kimi response (we need the full text to detect TOOL_CALL:)
                let rawText: string;
                let completionId: string;

                if (tokenType === 'jwt') {
                    logger.info(`[ToolBridge] Using Connect RPC (JWT) for tool-bridged request`);
                    const resp = await createCompletionV2(model, bridgedMessages, token, convId);
                    rawText = resp.choices?.[0]?.message?.content ?? '';
                    completionId = resp.id ?? util.uuid();
                } else {
                    logger.info(`[ToolBridge] Using REST API (refresh token) for tool-bridged request`);
                    const tokens = chat.tokenSplit(authHeader);
                    const selectedToken = _.sample(tokens);
                    const resp = await chat.createCompletion(model, bridgedMessages, selectedToken, convId);
                    rawText = resp.choices?.[0]?.message?.content ?? '';
                    completionId = resp.id ?? util.uuid();
                }

                logger.info(`[ToolBridge] Raw Kimi response (first 300 chars): ${rawText.slice(0, 300)}`);

                // Parse for TOOL_CALL: lines
                const toolCalls = parseToolCallsFromText(rawText);

                if (toolCalls) {
                    logger.info(`[ToolBridge] Tool calls detected: ${toolCalls.map(tc => tc.name).join(', ')}`);

                    if (stream) {
                        const sseStream = buildToolCallsStream(toolCalls, model, completionId);
                        return new Response(sseStream, { type: 'text/event-stream' });
                    } else {
                        return formatToolCallsResponse(toolCalls, model, completionId);
                    }
                }

                // No tool call detected → return normal response
                logger.info(`[ToolBridge] No tool call detected — returning plain completion`);

                if (stream) {
                    // Wrap plain text as a simple SSE stream
                    const sseStream = new PassThrough();
                    const write = (obj: any) => sseStream.write(`data: ${JSON.stringify(obj)}\n\n`);
                    write({
                        id: completionId,
                        object: 'chat.completion.chunk',
                        created: util.unixTimestamp(),
                        model,
                        choices: [{ index: 0, delta: { role: 'assistant', content: rawText }, finish_reason: 'stop' }],
                    });
                    sseStream.write('data: [DONE]\n\n');
                    sseStream.end();
                    return new Response(sseStream, { type: 'text/event-stream' });
                } else {
                    return formatNormalResponse(rawText, model, completionId);
                }
            }

            // ── Standard (no tools) path ─────────────────────────────────────────────

            if (tokenType === 'jwt') {
                logger.info(`Using Connect RPC API (JWT token detected), convId: ${convId || 'new'}`);

                if (stream) {
                    const streamResponse = await createCompletionStreamV2(model, messages, token, convId);
                    return new Response(streamResponse, {
                        type: "text/event-stream"
                    });
                } else {
                    return await createCompletionV2(model, messages, token, convId);
                }
            } else {
                logger.info(`Using traditional REST API (refresh token detected)`);

                const tokens = chat.tokenSplit(authHeader);
                const selectedToken = _.sample(tokens);

                if (stream) {
                    const streamResponse = await chat.createCompletionStream(model, messages, selectedToken, convId);
                    return new Response(streamResponse, {
                        type: "text/event-stream"
                    });
                } else {
                    return await chat.createCompletion(model, messages, selectedToken, convId);
                }
            }
        }

    }

};
