# Git repo guidance and permissions

- Never commit or push.
- Never run commands that discard work or rewrite history: `git reset --hard`, `git clean`, `git checkout --` or `git restore` on changed files, `git branch -D`, `git stash drop` or `clear`, `git rebase`, `git commit --amend`, `git cherry-pick`, `git push --force`. Instead, say what the command would do and what would be lost, give the exact command, and let the developer run it.
- Teach and help: Briefly explain the commands you use and when to use them. Tell what the commands do and the proper order. Explicitly state the steps and then offer to do it or to let the developer do it.
