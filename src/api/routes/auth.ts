import _ from 'lodash';
import Request from '@/lib/request/Request.ts';
import logger from '@/lib/logger.ts';
import tokenStore from '@/lib/token-store.ts';

export function getServerToken(): string {
    return tokenStore.getToken();
}

function decodeToken(token: string): any {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        return {
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
            membership_level: payload.membership?.level,
            remaining_hours: payload.exp ? Math.max(0, Math.round((payload.exp - Date.now() / 1000) / 3600 * 10) / 10) : null
        };
    } catch (e) {
        return { valid: false, error: 'Failed to decode JWT payload' };
    }
}

function extractKimiAuth(input: string): string {
    let kimiAuth = '';
    const match = input.match(/kimi-auth=([^;\s]+)/);
    if (match && match[1]) {
        kimiAuth = match[1].trim();
    } else if (input.trim().startsWith('eyJ') && input.trim().split('.').length === 3) {
        kimiAuth = input.trim();
    }
    return kimiAuth;
}

export default {

    prefix: '/auth',

    post: {
        '/extract': async (request: Request) => {
            request.validate('body.cookies', _.isString);

            const kimiAuth = extractKimiAuth(request.body.cookies);

            if (!kimiAuth) {
                return {
                    success: false,
                    error: 'No kimi-auth token found in the provided cookies string'
                };
            }

            const tokenInfo = decodeToken(kimiAuth);

            return {
                success: true,
                token: kimiAuth,
                token_info: tokenInfo
            };
        },

        '/save': async (request: Request) => {
            request.validate('body.cookies', _.isString);

            const kimiAuth = extractKimiAuth(request.body.cookies);

            if (!kimiAuth) {
                return {
                    success: false,
                    error: 'No kimi-auth token found'
                };
            }

            const tokenInfo = decodeToken(kimiAuth);

            if (tokenInfo.is_expired) {
                return {
                    success: false,
                    error: 'Token is already expired',
                    token_info: tokenInfo
                };
            }

            tokenStore.save(kimiAuth, tokenInfo.expires_at, tokenInfo.expires_at ? Math.floor(new Date(tokenInfo.expires_at).getTime() / 1000) : null);
            logger.success('Server token saved successfully (persistent)');

            return {
                success: true,
                message: 'Token saved to server (persistent). Akan tetap tersimpan walau server restart.',
                token_info: tokenInfo,
                storage: 'persistent_file'
            };
        }
    },

    get: {
        '/status': async () => {
            if (!tokenStore.hasToken()) {
                return {
                    has_token: false,
                    message: 'No token saved on server'
                };
            }

            const token = tokenStore.getToken();
            const tokenInfo = decodeToken(token);
            const storeInfo = tokenStore.getInfo();
            return {
                has_token: true,
                token_info: tokenInfo,
                token_preview: token.substring(0, 30) + '...',
                saved_at: storeInfo?.saved_at || null,
                storage: 'persistent_file'
            };
        },

        '/clear': async () => {
            tokenStore.clear();
            logger.info('Server token cleared (persistent)');
            return {
                success: true,
                message: 'Server token cleared from persistent storage'
            };
        }
    }

};
