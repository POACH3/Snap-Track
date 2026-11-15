import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
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

export interface HttpServerOptions {
  router: Router<Contract, RpcContext>;
  authenticate: Authenticate;
  logLevel: string;
  /** The built web app. Absent in development, where Vite serves it. */
  webDistDir: string | undefined;
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
    rpc.all("/rpc/*", async (request, reply) => {
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
