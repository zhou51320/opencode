# Windows 7 Desktop Build

This document describes the supported Win7 package path for this fork. It
builds opencode from the current source tree and uses a verified prebuilt
Electron runtime. It does not depend on the local `20260605-opencode1.16/`
directory or any copied files from that artifact.

## Runtime

Use the `e3kskoy7wqk/Electron-for-windows-7` release asset:

- Release: `v40.2.0`
- Asset: `dist.zip`
- URL: `https://github.com/e3kskoy7wqk/Electron-for-windows-7/releases/download/v40.2.0/dist.zip`
- SHA-256: `ed4ebb022624ae38f764fcfc1dc1ce30fe2145298975d4c90e8d95412deeadea`

The extracted archive is a standard Electron distribution directory containing
`electron.exe`, `ffmpeg.dll`, `version`, `locales/`, and the other runtime files
required by `electron-builder`.

## CI Build

The only workflow kept in this fork is:

```text
.github/workflows/win7-desktop-prebuilt.yml
```

On push, it:

1. Checks out opencode source.
2. Installs Bun dependencies and Win32 x64 optional packages.
3. Downloads and verifies the Win7 Electron runtime release.
4. Builds desktop assets for `win32/x64`.
5. Packages an unpacked Win7 desktop build with `OPENCODE_ELECTRON_DIST`.
6. Uploads `opencode-desktop-win7-prebuilt-electron`.

The legacy source-built Electron runtime workflow was removed. Rebuilding
Electron/Chromium is no longer part of this fork's delivery path.

## Local Build

From the repository root:

```bash
cd packages/desktop
bun run build:win7
OPENCODE_ELECTRON_DIST=/absolute/path/to/extracted/electron-win7-runtime bun run package:win7
```

The output is written to:

```text
packages/desktop/dist/win7/win-unpacked
```

To inspect provenance:

```bash
bun run report:win7-runtime /absolute/path/to/extracted/electron-win7-runtime --out dist/win7/prebuilt-runtime
bun run report:win7-runtime dist/win7/win-unpacked --compare /absolute/path/to/extracted/electron-win7-runtime --out dist/win7/prebuilt-runtime-comparison
```

## Verified Behavior

As of 2026-06-06, the CI artifact produced with this runtime was tested on
Windows 7. App startup, login, terminal usage, and model requests were normal.
