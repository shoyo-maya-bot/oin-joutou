// Cloudflare Workers で公開する場合の入口。/api/* はランキングAPI、それ以外は public/ の静的ファイル。
import { onRequest } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  },
};
