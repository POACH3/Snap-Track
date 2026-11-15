# Log bugs instead of fixing them in passing

When work turns up a bug outside the current task, do not fix it in passing.

When you find it, check whether it is already in `docs/BUGS.md`, then complete the current task assigned by the developer.

If a bug is already in `docs/BUGS.md`, say nothing, unless you learned something new about it (a cause, a fix idea, more places it shows up). If you did, mention that in the end-of-task note and offer to update the entry.

If a bug is not in `docs/BUGS.md`, then when you are done with the task, send one brief note covering all such bugs. For each: what goes wrong, how relevant it is to the task, and how important it is to fix now (be honest; many bugs can wait). Ask: fix now, or log it?

If the developer does not want to fix it, or does not answer, add it to the top of "Open" in `docs/BUGS.md` in the format the file describes: a short title, when it was found, where it is, what happens, how to reproduce it, and any known cause or fix idea. Say what was not checked.

When a logged bug is fixed, move its entry to "Fixed" with the fix date and the commit or branch.
