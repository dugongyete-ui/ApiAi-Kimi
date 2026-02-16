import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { createGeminiCompletion } from '@/api/controllers/gemini-adapter.ts';
import { getServerToken } from '@/api/routes/auth.ts';

export default {

    prefix: '/v1beta',

    get: {
        '/models': async () => {
            return {
                models: [
                    {
                        name: 'models/gemini-1.5-pro',
                        displayName: 'Gemini 1.5 Pro',
                        description: 'Most capable model for complex reasoning tasks',
                        inputTokenLimit: 2097152,
                        outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
                    },
                    {
                        name: 'models/gemini-1.5-flash',
                        displayName: 'Gemini 1.5 Flash',
                        description: 'Fast model for high throughput',
                        inputTokenLimit: 1048576,
                        outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
                    },
                    {
                        name: 'models/gemini-pro',
                        displayName: 'Gemini Pro',
                        description: 'Previous generation model',
                        inputTokenLimit: 32768,
                        outputTokenLimit: 2048,
                        supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
                    },
                    {
                        name: 'models/kimi',
                        displayName: 'Kimi',
                        description: 'Kimi chat model via adapter',
                        inputTokenLimit: 32768,
                        outputTokenLimit: 8192,
                        supportedGenerationMethods: ['generateContent', 'streamGenerateContent']
                    }
                ]
            };
        }
    },

    post: {

        // Gemini generateContent endpoint
        '/models/:model\\:generateContent': async (request: Request) => {
            request
                .validate('body.contents', _.isArray)
                .validate('body.systemInstruction', v => _.isUndefined(v) || _.isObject(v) || _.isString(v));

            const authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];
            const apiKey = request.headers['x-goog-api-key'];
            let tokenHeader = authHeader || apiKey;
            if (!tokenHeader) {
                const st = getServerToken();
                if (st) tokenHeader = `Bearer ${st}`;
                else throw new Error('No token provided. Save a Kimi Auth token first or provide Authorization header.');
            }
            const authToken = tokenHeader.replace(/^Bearer\s+/i, '').trim();

            const model = request.params.model || 'gemini-pro';
            const { contents, systemInstruction } = request.body;

            const geminiResponse = await createGeminiCompletion(
                model,
                contents,
                systemInstruction,
                authToken,
                false
            );
            return geminiResponse;
        },

        '/models/:model\\:streamGenerateContent': async (request: Request) => {
            request
                .validate('body.contents', _.isArray)
                .validate('body.systemInstruction', v => _.isUndefined(v) || _.isObject(v) || _.isString(v));

            const authHeader = request.headers.authorization || request.headers.Authorization || request.headers['authorization'];
            const apiKey = request.headers['x-goog-api-key'];
            let tokenHeader = authHeader || apiKey;
            if (!tokenHeader) {
                const st = getServerToken();
                if (st) tokenHeader = `Bearer ${st}`;
                else throw new Error('No token provided. Save a Kimi Auth token first or provide Authorization header.');
            }
            const authToken = tokenHeader.replace(/^Bearer\s+/i, '').trim();

            const model = request.params.model || 'gemini-pro';
            const { contents, systemInstruction } = request.body;

            const geminiStream = await createGeminiCompletion(
                model,
                contents,
                systemInstruction,
                authToken,
                true
            );
            return new Response(geminiStream, {
                type: "text/event-stream"
            });
        }

    }

}