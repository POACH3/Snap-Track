# Feature plans

<!-- This file is the registry of every plan in this folder. Keep one row per
     plan. Format and naming rules are in .claude/rules/feature-plans.md. -->

Files here are plans for implementing features, one per feature. A plan that changes a requirement, the architecture or a core workflow names the `../../SPEC.md` sections it changes, and `SPEC.md` is updated to match in the same change. Where a plan and `SPEC.md` disagree, `SPEC.md` wins.

| Plan | Changes SPEC.md | Status |
|---|---|---|
| [stage-0-scaffold-plan.md](stage-0-scaffold-plan.md) | §4.5, §4.7, §9, §10, §11 (Stage 0), §12, §13 | shipped (2026-11-15) |
| [accounts-plan.md](accounts-plan.md) | §9 | shipped (2026-11-15) |

To add a plan: name it `<feature>-plan.md`, add the `Changes SPEC.md` and `Status` lines under its title, and add a row here.
