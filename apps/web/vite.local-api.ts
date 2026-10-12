import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ServerResponse } from "node:http";
import { loadEnv, type Connect, type Plugin, type ViteDevServer } from "vite";

/**
 * Dev-only stand-in for Vercel's runtime: serves the Path B functions in
 * `<repo>/api/<name>.ts` (default `{ fetch }` or named method exports) at
 * `/api/<name>` so the creation flow works on localhost without the Vercel CLI.
 * Runs before Vite's proxy; anything without a file here — and any route with its
 * own explicit `server.proxy` entry — falls through to the proxy (Path A on :8787).
 * Never used in builds.
 */
export function localApi(repoRoot: string): Plugin {
  const apiDir = resolve(repoRoot, "api");
  return {
    name: "flo-local-api",
    apply: "serve",
    configureServer(server) {
      // Root .env/.env.local (AI gateway credentials) then apps/web env (publishable key);
      // anything already exported in the shell wins.
      const env = { ...loadEnv("development", repoRoot, ""), ...loadEnv("development", server.config.root, "") };
      env.CREATION_API_URL ??= env.VITE_MEDUSA_URL ?? "http://localhost:9000";
      for (const [key, value] of Object.entries(env)) process.env[key] ??= value;

      const proxied = new Set(Object.keys(server.config.server.proxy ?? {}));
      server.middlewares.use("/api", (req, res, next) => {
        const name = (req.url ?? "/").split("?")[0]!.replace(/^\/+/, "");
        const file = resolve(apiDir, `${name}.ts`);
        if (!/^[a-z0-9-]+$/.test(name) || proxied.has(`/api/${name}`) || !existsSync(file)) return next();
        handle(server, file, req, res).catch((error) => {
          console.error(`[local-api] /api/${name} failed`, error);
          if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "Local API handler crashed." }));
        });
      });
    }
  };
}

async function handle(server: ViteDevServer, file: string, req: Connect.IncomingMessage, res: ServerResponse) {
  const mod = await server.ssrLoadModule(file);
  type Handler = (request: Request) => Promise<Response> | Response;
  const handler: Handler | undefined = mod.default?.fetch ?? mod[req.method ?? "GET"];
  if (!handler) {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed." }));
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }
  const body = req.method === "GET" || req.method === "HEAD" ? null : Buffer.concat(chunks);
  const response = await handler(new Request(`http://${req.headers.host ?? "localhost"}${req.originalUrl ?? req.url}`, {
    method: req.method ?? "GET",
    headers,
    body
  }));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

