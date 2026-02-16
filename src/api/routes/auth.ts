import _ from 'lodash';
import Request from '@/lib/request/Request.ts';

export default {

    prefix: '/auth',

    post: {
        '/extract': async (request: Request) => {
            request.validate('body.cookies', _.isString);

            const cookieString = request.body.cookies;
            let kimiAuth = '';

            const match = cookieString.match(/kimi-auth=([^;]+)/);
            if (match && match[1]) {
                kimiAuth = match[1].trim();
            } else if (cookieString.startsWith('eyJ') && cookieString.split('.').length === 3) {
                kimiAuth = cookieString.trim();
            }

            if (!kimiAuth) {
                return {
                    success: false,
                    error: 'No kimi-auth token found in the provided cookies string'
                };
            }

            let tokenInfo: any = { valid: false };
            try {
                const payload = JSON.parse(Buffer.from(kimiAuth.split('.')[1], 'base64').toString());
                tokenInfo = {
                    valid: true,
                    app_id: payload.app_id,
                    type: payload.typ,
                    user_id: payload.sub,
                    space_id: payload.space_id,
                    device_id: payload.device_id,
                    region: payload.region,
                    issued_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
                    expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
                    is_expired: payload.exp ? (Date.now() / 1000) > payload.exp : null,
                    membership_level: payload.membership?.level
                };
            } catch (e) {
                tokenInfo = { valid: false, error: 'Failed to decode JWT payload' };
            }

            return {
                success: true,
                token: kimiAuth,
                token_info: tokenInfo
            };
        }
    }

};
