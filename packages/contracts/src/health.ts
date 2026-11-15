import { z } from "zod";
import { publicProcedure } from "./procedure.ts";

export const PingOutput = z.object({
  status: z.literal("ok"),
  serverTime: z.iso.datetime(),
});
export type PingOutput = z.infer<typeof PingOutput>;

export const healthContract = {
  ping: publicProcedure.route({ method: "GET" }).output(PingOutput),
};
