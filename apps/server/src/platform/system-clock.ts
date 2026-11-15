import type { Clock } from "@snaptrack/core";

export const systemClock: Clock = { now: () => new Date() };
