# UI design follows docs/DESIGN.md

Before adding or changing any UI or CSS (anything in `apps/web/src/`, including
the theme tokens in `apps/web/src/app/theme.css`), read `docs/DESIGN.md` and
follow it.

- If `docs/DESIGN.md` has no answer for what you need, ask the developer. Do not
  invent one.
- If the developer asks for something that goes against `docs/DESIGN.md`, say
  briefly that it does not fit the app's style. Then ask: continue as asked, or
  change `docs/DESIGN.md` first? If they continue, do the work and log it under
  "Known inconsistencies" in `docs/DESIGN.md` (date, what differs, where).
- If the guide and the code disagree on their own (not because of a request),
  follow the guide for new work and do not fix the old code in passing. Log it
  under "Known inconsistencies" in `docs/DESIGN.md` (date, what differs, where)
  without asking, and mention it in the end-of-task note. This replaces the
  "fix now, or log it?" question in `refactor-log.md` for design mismatches.
- Apart from logging an inconsistency as above, do not edit `docs/DESIGN.md`
  without asking. A change to the guide is a design decision that belongs to
  the developer.
