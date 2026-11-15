# 0002: API layer: oRPC, contract-first

**Date:** 2026-11-15. **Status:** accepted.

## Context
Every endpoint's input and output must be defined once and typed on both sides (§3.2),
and the API must carry receipt images (§6.2). Options: oRPC, ts-rest, or a hand-written
layer of Zod schemas plus fetch wrappers.

## Decision
oRPC 1.16, contract-first. `packages/contracts` defines the contract with `@orpc/contract`;
the server implements it (`implement(contract)` in `platform/http/rpc.ts`); the web client
calls it through `@orpc/client` and `@orpc/tanstack-query`.

On Fastify it is mounted with `@orpc/server/fastify` under `/rpc/*`, inside an encapsulated
plugin that removes Fastify's body parsers so oRPC reads request bodies (including
multipart file uploads) itself.

**Checked on 2026-11-15:** a 5 MB `File` input sent through the typed client arrived
byte-for-byte (same SHA-256, size and MIME type).

## Consequences
- File uploads work natively; no separate upload endpoint.
- Because Fastify does not parse `/rpc` bodies, its `bodyLimit` does not apply there.
  Stage 2 must set an upload size limit before accepting images.
- ts-rest was not chosen: its file-upload support is thinner, and oRPC's TanStack Query
  integration removes hand-written query hooks.
