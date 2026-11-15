import { oc } from "@orpc/contract";
import { z } from "zod";

export const PingOutput = z.object({
  status: z.literal("ok"),
  serverTime: z.iso.datetime(),
});
export type PingOutput = z.infer<typeof PingOutput>;

export const healthContract = {
  ping: oc.route({ method: "GET" }).output(PingOutput),
};
