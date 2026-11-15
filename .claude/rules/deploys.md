# Deploys

Never run a deploy script unless the developer asked for that specific script.
Before running, say which environment it targets (development or production)
and what it will change.

Production is the Fin Snap container running on the Mac Studio, with its
database and image volume. Development is a separate container
(`fin-snap-dev`) with its own database and volume, on the Mac Studio or
another machine.

- Changes to production (rebuilding or restarting its container, copying
  files to it, running migrations against its database) need the
  developer's go-ahead each time, even if a similar change was approved
  before.
- Never delete, overwrite, reset or seed the production database or image
  volume.
- On the Mac Studio, confirm which container a command targets before
  running it. If it is unclear, ask.
