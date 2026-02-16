import fs from 'fs-extra';

import Response from '@/lib/response/Response.ts';
import chat from "./chat.ts";
import ping from "./ping.ts";
import token from './token.ts';
import models from './models.ts';
import gemini from './gemini.ts';
import claude from './claude.ts';
import auth from './auth.ts';

export default [
    {
        get: {
            '/': async () => {
                const content = await fs.readFile('public/welcome.html');
                return new Response(content, {
                    type: 'html',
                    headers: {
                        Expires: '-1',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache'
                    }
                });
            }
        }
    },
    chat,
    ping,
    token,
    models,
    gemini,
    claude,
    auth
];