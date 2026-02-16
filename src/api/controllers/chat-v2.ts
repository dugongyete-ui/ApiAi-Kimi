/**
 * Connect RPC Chat Controller (V2)
 */

import { PassThrough } from "stream";
import { ConnectRPCClient } from '@/lib/connect-rpc';
import type { ConnectConfig } from '@/lib/connect-rpc/types.ts';
import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import logger from '@/lib/logger.ts';
import util from '@/lib/util.ts';

const MODEL_NAME = 'kimi';

export function detectTokenType(token: string): 'jwt' | 'refresh' {
    if (token.startsWith('eyJ') && token.split('.').length === 3) {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            if (payload.app_id === 'kimi' && payload.typ === 'access') {
                return 'jwt';
            }
        } catch (e) {
        }
    }
    return 'refresh';
}

function extractDeviceIdFromJWT(token: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.device_id;
    } catch (e) {
        return undefined;
    }
}

function extractSessionIdFromJWT(token: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.ssid;
    } catch (e) {
        return undefined;
    }
}

function extractUserIdFromJWT(token: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return payload.sub;
    } catch (e) {
        return undefined;
    }
}

function getScenario(model: string): string {
    if (model.includes('search')) {
        return 'SCENARIO_SEARCH';
    } else if (model.includes('research') || model.includes('agent-swarm') || model.includes('swarm')) {
        return 'SCENARIO_RESEARCH';
    } else if (model.includes('agent')) {
        return 'SCENARIO_RESEARCH';
    } else if (model.includes('k1')) {
        return 'SCENARIO_K1';
    }
    return 'SCENARIO_K2';
}

function createClient(authToken: string): ConnectRPCClient {
    const config: ConnectConfig = {
        baseUrl: 'https://www.kimi.com',
        authToken: authToken,
        deviceId: extractDeviceIdFromJWT(authToken),
        sessionId: extractSessionIdFromJWT(authToken),
        userId: extractUserIdFromJWT(authToken),
    };
    return new ConnectRPCClient(config);
}

function extractMessageContent(messages: any[]): string {
    const lastMessage = messages[messages.length - 1];
    if (typeof lastMessage.content === 'string') {
        return lastMessage.content;
    } else if (Array.isArray(lastMessage.content)) {
        return lastMessage.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('\n');
    }
    return '';
}

export async function createCompletionV2(
    model: string,
    messages: any[],
    authToken: string,
    convId?: string
): Promise<any> {
    logger.info(`V2 completion (non-stream), model: ${model}, chatId: ${convId || 'new'}`);

    const tokenType = detectTokenType(authToken);
    if (tokenType !== 'jwt') {
        throw new APIException(EX.API_REQUEST_FAILED, 'Connect RPC requires JWT token (kimi-auth).');
    }

    const messageContent = extractMessageContent(messages);
    const client = createClient(authToken);
    const scenario = getScenario(model);
    const isThinking = model.includes('thinking');

    const response = await client.chatText(messageContent, {
        scenario: scenario as any,
        thinking: isThinking,
        chatId: convId,
    });

    return {
        id: response.chatId || util.uuid(),
        model: model,
        object: 'chat.completion',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: response.text,
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: messageContent.length,
            completion_tokens: response.text.length,
            total_tokens: messageContent.length + response.text.length,
        },
        created: util.unixTimestamp(),
    };
}

export async function createCompletionStreamV2(
    model: string,
    messages: any[],
    authToken: string,
    convId?: string
): Promise<PassThrough> {
    logger.info(`V2 completion (stream), model: ${model}, chatId: ${convId || 'new'}`);

    const tokenType = detectTokenType(authToken);
    if (tokenType !== 'jwt') {
        throw new APIException(EX.API_REQUEST_FAILED, 'Connect RPC requires JWT token (kimi-auth).');
    }

    const messageContent = extractMessageContent(messages);
    const client = createClient(authToken);
    const scenario = getScenario(model);
    const isThinking = model.includes('thinking');

    const { stream: connectStream, chatIdPromise } = await client.chatStream(messageContent, {
        scenario: scenario as any,
        thinking: isThinking,
        chatId: convId,
    });

    const sseStream = new PassThrough();
    let responseChatId = convId || '';

    connectStream.on('connectMessage', (msg: any) => {
        if (msg.chat?.id && !responseChatId) {
            responseChatId = msg.chat.id;
        }

        if (msg.block?.text?.content) {
            const chunk = {
                id: responseChatId || util.uuid(),
                object: 'chat.completion.chunk',
                created: util.unixTimestamp(),
                model: model,
                choices: [
                    {
                        index: 0,
                        delta: {
                            content: msg.block.text.content,
                        },
                        finish_reason: null,
                    },
                ],
            };
            sseStream.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }

        if (msg.done) {
            const endChunk = {
                id: responseChatId || util.uuid(),
                object: 'chat.completion.chunk',
                created: util.unixTimestamp(),
                model: model,
                choices: [
                    {
                        index: 0,
                        delta: {},
                        finish_reason: 'stop',
                    },
                ],
            };
            sseStream.write(`data: ${JSON.stringify(endChunk)}\n\n`);
            sseStream.write('data: [DONE]\n\n');
            sseStream.end();
        }
    });

    connectStream.on('end', () => {
        if (!sseStream.destroyed && sseStream.writable) {
            sseStream.end();
        }
    });

    connectStream.on('error', (err: Error) => {
        logger.error(`V2 stream error: ${err.message}`);
        sseStream.destroy(err);
    });

    return sseStream;
}
