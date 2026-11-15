// Users, sessions and login (SPEC.md §4.3, §9). The only file other modules may import.
export { createAuthModule, type AuthModuleOptions } from "./adapters/auth-module.ts";
export type { AuthService } from "./application/auth-service.ts";
export type { SignedInUser } from "./domain/user.ts";
