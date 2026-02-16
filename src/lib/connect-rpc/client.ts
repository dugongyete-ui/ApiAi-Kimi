/**
 * Connect RPC Client
 */

import axios, { AxiosInstance } from 'axios';
import { PassThrough } from 'stream';
import type { ConnectConfig, ChatOptions, ChatRequest, ConnectMessage, TextResponse } from './types.ts';
import {
    encodeConnectMessage,
    parseStreamingResponse,
    extractTextFromMessages,
    extractChatId,
    extractMessageId,
    decodeConnectMessage
} from './protocol.ts';
import logger from '@/lib/logger.ts';

export class ConnectRPCClient {
    private config: ConnectConfig;
    private axios: AxiosInstance;

    constructor(config: ConnectConfig) {
        this.config = config;

        this.axios = axios.create({
            baseURL: config.baseUrl,
            timeout: 120000,
            headers: {
                'Content-Type': 'application/connect+json',
                'Connect-Protocol-Version': '1',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br, zstd',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Origin': config.baseUrl,
                'Referer': `${config.baseUrl}/`,
                'R-Timezone': 'Asia/Shanghai',
                'X-Language': 'zh-CN',
                'X-Msh-Platform': 'web',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
            },
            validateStatus: () => true,
        });

        this.axios.interceptors.request.use((config) => {
            if (this.config.authToken) {
                config.headers['Authorization'] = `Bearer ${this.config.authToken}`;
            }
            if (this.config.deviceId) {
                config.headers['X-Msh-Device-Id'] = this.config.deviceId;
            }
            if (this.config.sessionId) {
                config.headers['X-Msh-Session-Id'] = this.config.sessionId;
            }
            if (this.config.userId) {
                config.headers['X-Traffic-Id'] = this.config.userId;
            }
            return config;
        });
    }

    async chat(message: string, options: ChatOptions = {}): Promise<ConnectMessage[]> {
        const {
            scenario = 'SCENARIO_K2',
            thinking = false,
            chatId
        } = options;

        const requestData: ChatRequest = {
            scenario,
            message: {
                role: 'user',
                blocks: [
                    {
                        message_id: '',
                        text: {
                            content: message
                        }
                    }
                ],
                scenario
            },
            options: {
                thinking
            }
        };

        if (chatId) {
            requestData.chatId = chatId;
        }

        const encodedData = encodeConnectMessage(requestData);

        logger.info(`Sending Connect RPC request (chatId: ${chatId || 'new'}): ${message.substring(0, 50)}...`);

        try {
            const response = await this.axios.post(
                '/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
                encodedData,
                {
                    responseType: 'arraybuffer'
                }
            );

            if (response.status !== 200) {
                const errorText = Buffer.from(response.data).toString('utf-8');
                logger.error(`Connect RPC error: ${response.status} - ${errorText}`);
                throw new Error(`Connect RPC request failed: ${response.status}`);
            }

            const responseBuffer = Buffer.from(response.data);
            const messages = parseStreamingResponse(responseBuffer);

            logger.success(`Connect RPC response received: ${messages.length} messages`);

            return messages;

        } catch (error) {
            logger.error(`Connect RPC request error: ${error}`);
            throw error;
        }
    }

    /**
     * True streaming chat - returns a PassThrough stream and chatId
     */
    async chatStream(message: string, options: ChatOptions = {}): Promise<{ stream: PassThrough, chatIdPromise: Promise<string | undefined> }> {
        const {
            scenario = 'SCENARIO_K2',
            thinking = false,
            chatId
        } = options;

        const requestData: ChatRequest = {
            scenario,
            message: {
                role: 'user',
                blocks: [
                    {
                        message_id: '',
                        text: {
                            content: message
                        }
                    }
                ],
                scenario
            },
            options: {
                thinking
            }
        };

        if (chatId) {
            requestData.chatId = chatId;
        }

        const encodedData = encodeConnectMessage(requestData);
        const outputStream = new PassThrough();

        logger.info(`Sending Connect RPC streaming request (chatId: ${chatId || 'new'}): ${message.substring(0, 50)}...`);

        let resolvedChatId: string | undefined;
        const chatIdPromise = new Promise<string | undefined>((resolveChatId) => {
            (async () => {
                try {
                    const response = await this.axios.post(
                        '/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
                        encodedData,
                        {
                            responseType: 'stream'
                        }
                    );

                    if (response.status !== 200) {
                        let errorText = '';
                        response.data.on('data', (chunk: Buffer) => { errorText += chunk.toString(); });
                        response.data.on('end', () => {
                            logger.error(`Connect RPC stream error: ${response.status} - ${errorText}`);
                            outputStream.destroy(new Error(`Connect RPC request failed: ${response.status} - ${errorText}`));
                            resolveChatId(undefined);
                        });
                        return;
                    }

                    let buffer = Buffer.alloc(0);
                    let chatIdResolved = false;

                    response.data.on('data', (chunk: Buffer) => {
                        buffer = Buffer.concat([buffer, chunk]);

                        while (buffer.length >= 5) {
                            const msgLength = buffer.readUInt32BE(1);

                            if (buffer.length < 5 + msgLength) {
                                break;
                            }

                            const messageData = buffer.slice(0, 5 + msgLength);
                            buffer = buffer.slice(5 + msgLength);

                            const message = decodeConnectMessage(messageData);
                            if (message) {
                                if (message.chat?.id && !chatIdResolved) {
                                    resolvedChatId = message.chat.id;
                                    chatIdResolved = true;
                                    resolveChatId(resolvedChatId);
                                }

                                outputStream.emit('connectMessage', message);

                                if (message.done) {
                                    if (!chatIdResolved) {
                                        resolveChatId(resolvedChatId);
                                    }
                                    outputStream.end();
                                    return;
                                }
                            }
                        }
                    });

                    response.data.on('end', () => {
                        if (!chatIdResolved) {
                            resolveChatId(resolvedChatId);
                        }
                        if (!outputStream.destroyed) {
                            outputStream.end();
                        }
                    });

                    response.data.on('error', (err: Error) => {
                        logger.error(`Connect RPC stream data error: ${err.message}`);
                        if (!chatIdResolved) {
                            resolveChatId(undefined);
                        }
                        outputStream.destroy(err);
                    });

                } catch (error) {
                    logger.error(`Connect RPC stream request error: ${error}`);
                    resolveChatId(undefined);
                    outputStream.destroy(error as Error);
                }
            })();
        });

        return { stream: outputStream, chatIdPromise };
    }

    async chatText(message: string, options: ChatOptions = {}): Promise<TextResponse> {
        const messages = await this.chat(message, options);

        return {
            text: extractTextFromMessages(messages),
            chatId: extractChatId(messages),
            messageId: extractMessageId(messages)
        };
    }
}

export function createConnectClient(config: ConnectConfig): ConnectRPCClient {
    return new ConnectRPCClient(config);
}
