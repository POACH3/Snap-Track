# 0006: Extraction model and relay contract

**Date:** 2026-11-15. **Status:** accepted (2026-11-15: a real receipt photo went through the
relay and oMLX read it; an abandoned request stopped generating within about 10 s).

## Context
SnapTrack reads receipt photos with a model on the household's shared LLM server (SPEC.md
§6.3). That server holds one model at a time, serves people chatting, and swapping models
costs 8–13 s and discards chat users' caches. SPEC first assumed a separate vision model, with
the relay switching to it for each run of receipts.

Checking the LLM-Server project showed the installed chat model,
`mlx-community/Qwen3.6-35B-A3B-4bit`, is the full multimodal model (333 vision tensors), and
oMLX serves it through `mlx-vlm` 0.7.1. The relay (`relay.py`, port 8081) is a thin
pass-through: usage log, owner's reserve switch, no queue, no cancelling.

## Decision
- **Model:** the chat model, `Qwen3.6-35B-A3B-4bit` (`EXTRACTION_MODEL`). No separate vision
  model and no model switch while it is loaded. Earlier spot checks on real receipts matched a
  large hosted model on every price and total.
- **Request:** `POST /v1/chat/completions` through the relay, not streamed; all photos in one
  user message as base64 data URIs; headers `X-LLM-Priority: low` and
  `X-OpenWebUI-User-Name: snaptrack`; SnapTrack's own oMLX sub-key. Overrides the chat
  defaults: temperature 0, presence penalty 0, thinking off, `max_tokens` 8,000.
- **Replies** (relay changes built in the LLM-Server project):
  - `200` with `choices`: output, validated with Zod (oMLX doesn't enforce JSON schemas).
  - `200` without `choices`: failed attempt (oMLX commits to 200 after 2 s).
  - `503` `low_priority_busy` (a chat is running or another model is loaded) and `503`
    `server_reserved`: wait for `Retry-After`; no attempt used.
  - `502` or no relay: LLM server not running; wait; no attempt used.
  - Anything else, or no answer in `EXTRACTION_TIMEOUT_MS`: failed attempt.
- **Chat comes first only at the start:** the relay won't start a receipt during a chat, but a
  chat arriving mid-receipt runs alongside it (accepted by the owner).

## Consequences
- Much less to build in the LLM-Server project: a priority header check and one refusal
  reply, plus passing replies through so a timed-out receipt stops using the model.
- **Image size checked:** a 4 MP photo used 3,410 prompt tokens (about 1,000 would mean oMLX
  had shrunk it to 1 MP), so small print reaches the model nearly at full resolution. One photo
  took 14.9 s (12.2 s reading the image, 2.5 s answering), well inside the 180 s limit.
- Changing the model is a config change (`EXTRACTION_MODEL`); changing the server is one new
  `ReceiptExtractor` adapter.
