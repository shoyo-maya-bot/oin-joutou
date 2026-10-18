// Cloudflare Pages で公開する場合の入口（Workers で公開する場合は src/worker.js を使う）
export { onRequest } from '../../src/api.js';
