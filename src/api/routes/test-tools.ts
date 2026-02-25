import { PassThrough } from 'stream';
import Response from '@/lib/response/Response.ts';
import { runAllToolTests } from '@/api/controllers/test-tools.ts';

export default {
    prefix: '/v1/test-tools',
    get: {
        '': async () => {
            const stream = new PassThrough();
            runAllToolTests(stream).catch(err => {
                stream.write(`\nFATAL ERROR: ${err.message}\n`);
                stream.end();
            });
            return new Response(stream, { type: 'text/plain; charset=utf-8' });
        },
    },
};
