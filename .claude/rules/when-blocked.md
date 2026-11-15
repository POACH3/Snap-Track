# When a permission blocks something

If a `deny` rule blocks a command or edit, stop. Tell the developer what was
blocked, why it was needed, and the exact command or change for them to make. Do not
try another route to the same result, such as `bash -c`, `sed -i`, a script,
or a different tool.

For `rm -rf` and `sudo`, which `ask` first: list exactly what will be deleted
or changed before asking, and look at the target first.
