import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import chat from '@/api/controllers/chat.ts';
import { createCompletionV2, createCompletionStreamV2, detectTokenType } from '@/api/controllers/chat-v2.ts';
import { getServerToken } from '@/api/routes/auth.ts';
import logger from '@/lib/logger.ts';

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
                    throw new Error('No token provided. Please save a Kimi Auth token first via the website or provide Authorization header.');
                }
            }

            const token = authHeader.replace(/^Bearer\s+/i, '').trim();

            const tokenType = detectTokenType(token);

            let { model, conversation_id: convId, messages, stream, use_search } = request.body;

            if (use_search)
                model = 'kimi-search';

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