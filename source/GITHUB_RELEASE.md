# Publishing a release

The checklist for building Nova Modding Suite and putting it on the Releases page.

## Before you build

- **Node.js 18+.**
- **`Texconv.exe` in the repo root** (next to `package.json`). It is committed, so a fresh clone already has it. The build copies it to `runtime-tools/texconv.exe` inside the app (`build.extraResources`), and the server resolves it there for DDS → PNG conversion — that is what turns HOI4's `.dds` icons and `.tga` flags into something the editor can draw. Without it the app still runs; icon and flag conversion is what breaks.
- **`npm install`.**

## Build

```bash
npm run build
```

Portable Windows x64, output in `dist/`:

```
dist/Nova Modding Suite <version>.exe
```

The version in the filename comes from `package.json` → `"version"`, and the name from `build.productName` (note: under `build`, not at the top level). `npm run build:portable` is the same thing spelled out.

There is also a Steam/unpacked target, which produces a folder rather than a single file:

```bash
npm run build:steam      # electron-builder --win dir -> dist/win-unpacked/
```

Use that one for a Steam depot or for debugging what actually got bundled. For a GitHub download, ship the single portable `.exe`.

## Before you tag

1. `npm test` — the full suite. It must be green, and it refuses to report a pass if a committed test file is missing from disk, so a quarantined or deleted test shows up as a failure rather than as silently reduced coverage.
2. Check `package.json` → `"version"`, the newest `## ` heading in `CHANGELOG.md`, and the tag you are about to create all say the same thing. A build and a tag that disagree make every later bug report ambiguous.

## Publish

1. Tag the release commit (`v1.0.6`) and push the tag.
2. Create the GitHub release against that tag.
3. **Attach the portable `.exe`** from `dist/`. Do not attach `dist/win-unpacked/`.
4. For the release notes, paste that version's section from `CHANGELOG.md`.
5. Keep the SmartScreen note somewhere visible — the executable is not code-signed, so Windows shows *"Windows protected your PC"* and the user has to choose **More info → Run anyway**. Saying so up front is the difference between a cautious user and a suspicious one.

## What recipients need

Nothing but the `.exe`. It bundles the Electron runtime, the server and `public/`. Nova reads the copy of Hearts of Iron IV already installed on their machine and writes only into their own mod folder.

If auto-detection misses their install, `README.md` documents the overrides: `HOI4_MOD_ROOT`, `HOI4_ROOT`, and `PORT`.

## If the build fails

- Confirm `Texconv.exe` is in the repo root.
- Re-run and read the terminal error — `electron-builder` usually names the missing file.
- To test without packaging: `npm run dev`.
