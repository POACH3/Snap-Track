# Log cleanup instead of doing it

When work turns up cleanup outside the current task (unused code, stale
references, lint warnings that were already there), do not fix it in passing.

When you find it, check whether it is already in `docs/REFACTOR.md`, then complete the current task assigned by the developer.

If an item is already in `docs/REFACTOR.md`, say nothing.

If an item is not in `docs/REFACTOR.md`, then when you are done with the task, send one brief note covering all such items. For each: what the issue is, how relevant it is to the task, and how important it is to correct now (be honest; many things can wait). Ask: fix now, or log it?

If the developer does not want to fix it or if they don't answer, add it to `docs/REFACTOR.md` with a date, where it is, why, and how to remove it.
