import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import fastifyStatic from "@fastify/static";
import type { Router } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fastify";
import { ResponseHeadersPlugin, SimpleCsrfProtectionHandlerPlugin } from "@orpc/server/plugins";
import type { Contract, PublicUser } from "@snaptrack/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import type { RpcContext } from "./rpc.ts";

/** Resolves the signed-in user from a request's cookies, and a renewed cookie if one is due. */
export type Authenticate = (
  cookieHeader: string | undefined,
) => { user: PublicUser; setCookie?: string } | null;

/** Extra routes outside the API, such as receipt images; registered by a module's adapter. */
export type HttpRoutes = (app: FastifyInstance, authenticate: Authenticate) => void;

/**
 * Largest API request accepted: a receipt's photos together (docs/feature-plans/capture-and-upload-plan.md).
 * Checked from Content-Length before oRPC reads the body (ADR 0002).
 */
export const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

export interface HttpServerOptions {
  router: Router<Contract, RpcContext>;
  authenticate: Authenticate;
  routes?: HttpRoutes[];
  /** Defaults to MAX_REQUEST_BYTES; tests set it lower. */
  maxRequestBytes?: number;
  logLevel: string;
  /** The built web app. Absent in development, where Vite serves it. */
  webDistDir: string | undefined;
}

/**
 * Cuts off a body sent without Content-Length (chunked, e.g. relayed by a proxy) once it passes
 * the limit. Node already stops at a Content-Length, so that case is checked from the header.
 * Same approach as oRPC's BodyLimitPlugin for its Node adapter, which Fastify's lacks.
 */
function limitStreamedBody(raw: IncomingMessage, maxBytes: number): void {
  let received = 0;
  const emit = raw.emit.bind(raw);
  // Counting in `emit` sees every chunk without adding a reader, so oRPC still reads the body normally.
  raw.emit = (event: string | symbol, ...args: unknown[]): boolean => {
    if (event === "data" && args[0] instanceof Uint8Array) {
      received += args[0].length;
      if (received > maxBytes) {
        raw.destroy(new Error("Request body over the size limit"));
        return false;
      }
    }
    return emit(event, ...args);
  };
}

export function createHttpServer(options: HttpServerOptions): FastifyInstance {
  const app = Fastify({
    logger: { level: options.logLevel },
    // `tailscale serve` is the only thing in front of the server (SPEC.md §4.7).
    trustProxy: "127.0.0.1",
    genReqId: () => randomUUID(),
  });

  app.get("/healthz", () => ({ status: "ok" }));

  const rpcHandler = new RPCHandler(options.router, {
    // Every call must carry a header a cross-site form can't send (docs/feature-plans/accounts-plan.md).
    plugins: [new ResponseHeadersPlugin(), new SimpleCsrfProtectionHandlerPlugin()],
  });
  void app.register((rpc, _opts, done) => {
    // oRPC reads request bodies itself (including file uploads), so Fastify must not parse them.
    rpc.removeAllContentTypeParsers();
    rpc.addContentTypeParser("*", (_request, _payload, parsed) => {
      parsed(null, undefined);
    });
    const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;
    rpc.all("/rpc/*", async (request, reply) => {
      if (Number(request.headers["content-length"]) > maxRequestBytes) {
        return reply.status(413).send({ error: "Upload too large" });
      }
      limitStreamedBody(request.raw, maxRequestBytes);
      const cookieHeader = request.headers.cookie;
      const session = options.authenticate(cookieHeader);
      // Set on the raw response so it survives oRPC writing its own headers.
      if (session?.setCookie !== undefined) reply.raw.setHeader("set-cookie", session.setCookie);
      const context: RpcContext = { user: session?.user ?? null, cookieHeader };
      const { matched } = await rpcHandler.handle(request, reply, { prefix: "/rpc", context });
      if (!matched) await reply.status(404).send({ error: "Not found" });
    });
    done();
  });

  for (const register of options.routes ?? []) register(app, options.authenticate);

  const webDistDir = options.webDistDir;
  if (webDistDir !== undefined && existsSync(webDistDir)) {
    void app.register(fastifyStatic, { root: webDistDir, wildcard: false });
    // Client-side routes: any other page request gets the app shell.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/rpc/")) {
        return reply.sendFile("index.html");
      }
      return reply.status(404).send({ error: "Not found" });
    });
  }

  return app;
}
