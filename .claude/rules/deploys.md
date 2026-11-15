# Deploys

Never run a deploy script unless the developer asked for that specific script.
Before running, say which environment it targets (development or production)
and what it will change.

Production is the `fin-snap` LaunchDaemon running natively on the Mac Studio
under its own macOS account, with its own data folder (database, images,
imported files, backups). Development is a separate service (`fin-snap-dev`)
with its own data folder, database, image folder and port, on the Mac Studio,
or `pnpm dev` on another machine. See `SPEC.md` §4.7.

- Changes to production (deploying to it, restarting its LaunchDaemon,
  copying files into its data folder, running migrations against its
  database, or changing its account, folder permissions or firewall rules)
  need the developer's go-ahead each time, even if a similar change was
  approved before.
- Never delete, overwrite, reset or seed the production database, images or
  data folder.
- On the Mac Studio, confirm which service (`fin-snap` or `fin-snap-dev`) and
  which data folder a command targets before running it. If it is unclear, ask.
