# 0005: Server-side image conversion with macOS `sips`

**Date:** 2026-11-15. **Status:** accepted.

## Context
Phones send JPEGs the browser has already shrunk (SPEC.md §6.1), but a browser can't always
decode a photo itself: Chrome on a desktop can't read HEIC, the iPhone's default format. The
server must then convert the original to JPEG and shrink it to the same pixel limit. It also
makes a small thumbnail of every photo for the receipts list. The converter must run natively
on macOS ARM64 under the hidden `_snaptrack` account, with no internet access (§4.7). Options:
`sharp` (libvips; its prebuilt binaries leave out HEIC decoding), `heic-convert` (libheif
compiled to WebAssembly; a new dependency tree, slower), or macOS's built-in `sips`.

## Decision
- **`sips`** (`/usr/bin/sips`), run as a child process with a time limit, behind the
  `ImageConverter` port (`apps/server/src/modules/receipts/adapters/sips-image-converter.ts`).
  Nothing to install, nothing for the supply-chain rules to cover, and it reads HEIC natively.
- Each call works on a private copy in a fresh temporary folder, removed afterwards.
- `sips` exits 0 when it can't read a file (it prints `<nil>`), so the adapter reads its
  output and checks the file it wrote, never just the exit code. An unreadable image is an
  expected failure (`undefined`), not an exception.
- Format is decided from a file's first bytes, never its name or the browser's claimed type.

## Consequences
- The server's image conversion works only on macOS. That matches where SnapTrack runs (§4.6).
  The adapter's contract test runs only on macOS and is skipped elsewhere; every other test
  uses the fake converter.
- `sips` keeps a photo's orientation tag instead of rotating its pixels. Browsers apply the tag,
  so images display the right way up; whether the Stage 3 model does too is checked then.
- Moving off macOS means writing one new adapter (e.g. with `sharp` plus a HEIC decoder) and
  changing one line in the composition root.
