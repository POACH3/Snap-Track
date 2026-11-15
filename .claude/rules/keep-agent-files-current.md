# Keep AGENTS.md and CLAUDE.md in step with the repo

Run this check once, when a major piece of work is finished and before the
developer commits or pushes it. Major means a new feature, a refactor, or work
that added, moved, or removed folders or several files. Skip small fixes.

`AGENTS.md` holds the shared instructions, including the structure section.
`CLAUDE.md` only imports it and adds Claude-only notes. Compare the structure
section of `AGENTS.md` against what changed. If a folder or file it names is
gone, moved, or renamed, or something new belongs in it, tell the developer
and propose the edit. If nothing needs changing, say nothing.

Put shared instructions in `AGENTS.md`, not `CLAUDE.md`. Keep `CLAUDE.md` to
the `@AGENTS.md` import and notes that apply only to Claude Code.

`AGENTS.md` and `CLAUDE.md` edits need the developer's approval (see
permissions.ask).
