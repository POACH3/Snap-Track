# Database commands

Before running any command that changes a database's data or schema (such as
a reset, migration, seed, or sync script), say which database it will hit
(local, test, staging, production) and what it will change.

Never run a command that wipes or recreates a database (a reset, drop, or
rebuild) against data the developer has not said can be lost.

If migrations have been rewritten, squashed, or reordered, they will not apply
cleanly to a database built from the old set. Say so before running them, and
check `docs/REFACTOR.md` for any notes on it.

List this project's database commands in `AGENTS.md` under "Ask first".
