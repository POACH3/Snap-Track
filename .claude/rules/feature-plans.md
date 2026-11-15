# Feature plans

Plans for implementing features live in `docs/feature-plans/`: one file per
feature, named `<feature>-plan.md` (lowercase, kebab-case). A plan is mainly a
working document for planning and brainstorming that feature's implementation.
`docs/feature-plans/README.md` indexes every file there. Plans may be edited.

Every file there uses the same format. Under the title, add these two lines,
with two trailing spaces after the first so they render on separate lines:

```
**Changes SPEC.md:** <sections, by number and name, or "none">.
**Status:** <active | shipped> (<short note, such as branch or merge state>).
```

- A plan that changes a requirement, the architecture or a core workflow in
  `SPEC.md` names the sections on its `Changes SPEC.md` line, says what changed
  and why in its body, and updates `SPEC.md` in the same change.
- A plan that only works out how to build what `SPEC.md` already says writes
  "none" on that line.
- Small deviations (a new control on an existing screen, a renamed screen, a
  tweaked limit) are not spec changes. When in doubt, ask the developer.

When adding a file, add a row to the README table with its file name, the
`SPEC.md` sections it changes (or "none") and its status. When a plan's status
changes, update its `Status` line and its README row.
