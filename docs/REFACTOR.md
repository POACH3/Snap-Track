# Refactor list

Cleanup and refactor work to do later. Nothing here is done yet.

Entry format: a `##` title saying what to clean up, with `(added YYYY-MM-DD)`.
Then a short paragraph on what it is and how it came about (branch or commit
if known), followed by:

- Where: files, and functions or line numbers.
- Why: why it should change, or why it isn't needed any more.
- Why it can wait: what happens if it stays (optional).
- To fix (or To remove): the steps, and the checks to run afterwards.
- Before doing it, decide: anything that needs the developer's call first (optional).

Group related items under one title, each as its own bold bullet with these fields.
## SPEC.md says the LLM server starts at boot (added 2026-11-15)

Found while settling the relay contract for Stage 3 (commit `99d3151`). SnapTrack's SPEC
describes the LLM server as a LaunchDaemon that starts at boot, but the LLM-Server project's
own spec says its services are started and stopped by hand and never start by themselves.

- Where: `SPEC.md` §4.6 (Host, "Always on": "SnapTrack, the LLM server, and Tailscale start at
  boot"), §4.7 (Starting at boot: "The LLM server runs the same way under its own account"),
  and the §12 row "Whether oMLX gets the GPU when run as a LaunchDaemon …" (marked "Before
  Stage 3").
- Why: the spec no longer matches how the LLM server is run, and the §12 row may not apply.
- Why it can wait: nothing in SnapTrack depends on it. While the LLM server is stopped,
  extraction jobs wait and finish once it is started again.
- To fix: reword those lines to say the LLM server is started by hand (owned by the LLM-Server
  project), and close or reword the §12 row. Docs only; no checks needed.
- Before doing it, decide: whether the LLM server should start at boot after all (an
  LLM-Server project decision).
