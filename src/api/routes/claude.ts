import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { createClaudeCompletion } from '@/api/controllers/claude-adapter.ts';
import { getServerToken } from '@/api/routes/auth.ts';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                data: [
                    {
                        id: 'claude-3-opus-20240229',
                        object: 'model',
                        created: 1709602888,
                        owned_by: 'anthropic',
                        permission: [],
                        root: 'claude-3-opus-20240229',
                        parent: null,
                        label: 'Claude 3 Opus',
                        description: 'Most capable model for highly complex tasks',
                        input_token_limit: 200000,
                        output_token_limit: 4096
                    },
                    {
                        id: 'claude-3-sonnet-20240229',
                        object: 'model',
                        created: 1709602888,
                        owned_by: 'anthropic',
                        permission: [],
                        root: 'claude-3-sonnet-20240229',
                        parent: null,
                        label: 'Claude 3 Sonnet',
                        description: 'Balanced model for most use cases',
                        input_token_limit: 200000,
                        output_token_limit: 4096
                    },
                    {
                        id: 'claude-3-haiku-20240307',
                        object: 'model',
                        created: 1709602888,
                        owned_by: 'anthropic',
                        permission: [],
                        root: 'claude-3-haiku-20240307',
                        parent: null,
                        label: 'Claude 3 Haiku',
                        description: 'Fastest model for simple tasks',
                        input_token_limit: 200000,
                        output_token_limit: 4096
                    },
                    {
                        id: 'claude-3-5-sonnet-20241022',
                        object: 'model',
                        created: 1709602888,
                        owned_by: 'anthropic',
                        permission: [],
                        root: 'claude-3-5-sonnet-20241022',
                        parent: null,
                        label: 'Claude 3.5 Sonnet',
                        description: 'Latest Claude 3.5 Sonnet model',
                        input_token_limit: 200000,
                        output_token_limit: 8192
                    },
                    {
                        id: 'kimi',
                        object: 'model',
                        created: 1709602888,
                        owned_by: 'kimi',
                        permission: [],
                        root: 'kimi',
                        parent: null,
                        label: 'Kimi',
                        description: 'Kimi chat model via adapter',
                        input_token_limit: 32768,
                        output_token_limit: 8192
                    }
                ],
                object: "list"
            };
        }
    },

    post: {

        '/messages': async (request: Request) => {
            request
                .validate('body.messages', _.isArray)
                .validate('body.model', _.isString)
                .validate('body.max_tokens', v => _.isUndefined(v) || _.isNumber(v))
                .validate('body.stream', v => _.isUndefined(v) || _.isBoolean(v))
                .validate('body.system', v => _.isUndefined(v) || _.isString(v) || _.isArray(v));

            const authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];
            const apiKeyHeader = request.headers['x-goog-api-key'] || request.headers['x-api-key'];
            let tokenHeader = authHeader;
            if (!tokenHeader && apiKeyHeader) {
                tokenHeader = `Bearer ${apiKeyHeader}`;
            }
            if (!tokenHeader) {
                const st = getServerToken();
                if (st) tokenHeader = `Bearer ${st}`;
                else throw new Error('No token provided. Save a Kimi Auth token first or provide Authorization header.');
            }
            const authToken = tokenHeader.replace(/^Bearer\s+/i, '').trim();

            const { model, messages, system, stream } = request.body;

            if (stream) {
                const claudeStream = await createClaudeCompletion(
                    model,
                    messages,
                    system,
                    authToken,
                    true
                );
                return new Response(claudeStream, {
                    type: "text/event-stream"
                });
            } else {
                const claudeResponse = await createClaudeCompletion(
                    model,
                    messages,
                    system,
                    authToken,
                    false
                );
                return claudeResponse;
            }
        }

    }

}