import { os } from "../../../platform/http/rpc.ts";

export const healthRouter = {
  ping: os.health.ping.handler(() => ({ status: "ok" as const, serverTime: new Date().toISOString() })),
};
