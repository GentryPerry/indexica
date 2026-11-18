/**
 * Cloudflare Worker for jam.gentryperry.com. Static files (the single-page app) are served by the
 * assets binding; only /api/* reaches this code (see run_worker_first in wrangler.toml).
 */
import { handleApi, type Env } from './api';

export default {
  fetch(req: Request, env: Env & { ASSETS: { fetch(r: Request): Promise<Response> } }): Promise<Response> {
    if (new URL(req.url).pathname.startsWith('/api/')) return handleApi(req, env);
    return env.ASSETS.fetch(req);
  },
};
