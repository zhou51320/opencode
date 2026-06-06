# OpenCode Desktop

The OpenCode Desktop app, built with Electron.

## Development

```bash
bun install
bun dev
```

## Build

Run the `build` script to build the app's JS assets, then `package` to
bundle the assets as an application. The resulting app will be in `dist/`.

```bash
bun run build && bun run package
```

## Experimental Windows 7 Package

`package:win7` builds an unpacked Windows x64 desktop package from the current
opencode source tree. It pins the Electron version used by electron-builder to
`40.2.0`, accepts a Win7-compatible Electron distribution through
`OPENCODE_ELECTRON_DIST`, defaults the channel to `prod`, and writes output
under `dist/win7/`.

```bash
bun run build:win7
OPENCODE_ELECTRON_DIST=/path/to/patched/electron-40.2.0 bun run package:win7
```

If `OPENCODE_ELECTRON_DIST` is omitted, the package uses official Electron
40.2.0 and is only useful as a comparison baseline. The supported Win7 package
path uses the verified prebuilt `Electron-for-windows-7` runtime described
below.

The fast CI path is `.github/workflows/win7-desktop-prebuilt.yml`. It downloads
`e3kskoy7wqk/Electron-for-windows-7` release `v40.2.0` asset `dist.zip`, verifies
SHA-256 `ed4ebb022624ae38f764fcfc1dc1ce30fe2145298975d4c90e8d95412deeadea`,
and packages opencode with that runtime. The resulting artifact is
`opencode-desktop-win7-prebuilt-electron`.

As of 2026-06-06, the prebuilt runtime artifact path has been tested on Windows
7 for app startup, login, terminal usage, and model requests. Those flows were
normal.

The packaging script patches `app.asar` so Win32 native package entrypoints are
resolvable from inside the archive while `.node`, `.dll`, and `.exe` files stay
under `app.asar.unpacked`. It also verifies the Win7 PE header and required
Win32 package layout before exiting.

To inspect or compare a Win7 Electron runtime without repackaging the app, run:

```bash
bun run report:win7-runtime /path/to/runtime --out dist/win7/runtime-provenance
bun run report:win7-runtime dist/win7/win-unpacked --compare /path/to/reference-runtime --out dist/win7/runtime-comparison
```

The report writes matching `.json` and `.md` files with PE OS/subsystem
versions, risky imports, top-level runtime hashes, and optional comparison
differences.

### Runtime Provenance

The default Win7 package path does not build Electron itself. It packages
opencode desktop assets with the Electron distribution supplied by
`OPENCODE_ELECTRON_DIST`. The currently verified prebuilt runtime source is
`e3kskoy7wqk/Electron-for-windows-7` release `v40.2.0`.
