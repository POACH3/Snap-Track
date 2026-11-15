# Secrets stay out of reach

Never read, edit, or write any `.env*` file except `.env.example`, such as
`.env` or `.env.production`. Do not get around the block with `cat`, `grep`,
`sed`, or a script. Use `.env.example` to see which variables exist. If a task
needs a real value, ask the developer for it.

`permissions.deny` in `.claude/settings.json` blocks only the `.env*` files it
names. If you see another `.env*` file (other than `.env.example`), or a task
would create one, do not open it. Tell the developer so they can add `Read`,
`Edit`, and `Write` entries for it.
