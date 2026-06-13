# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> Contributions made with AI tools must follow the [AI usage policy](docs/ai-policy.md) — in
> particular, disclose AI use and ensure a human reviews, understands, and verifies the work before
> it is submitted.

## What this is

An unofficial Electron desktop client that wraps Notion's web apps (Notion, Calendar, Mail) to give Linux users a native-like experience: custom titlebar, multi-tab browsing, system tray, native notifications, and self-updating packages. Linux-only — there is no Windows/macOS path.

## Commands

- `npm start` — run the app locally in dev mode (`APPIMAGE=/ electron-vite dev`, with HMR for the renderer). The `APPIMAGE=/` env is what the updater uses to detect AppImage mode.
- `npm run build` — bundle main/preload/renderer with **electron-vite** into `out/`.
- `npm run preview` — run the built app from `out/` (production-like; no dev server).
- `npm run typecheck` — `tsc --noEmit` across the three project tsconfigs (node, preload, web). No JS is emitted by `tsc`; electron-vite/esbuild does the transpiling.
- `npm run lint` — ESLint `--fix` + Prettier on **changed/untracked files only** (not the whole tree).
- `npm run lint:all` — same but across all git-tracked files.
- `npm run lint:deep` — lint files changed since the merge-base with the main branch.
- `npm run make` — `electron-vite build` then package an unpacked Linux x64 build via `electron-packager` into `dist/`.
- `npm run pack` — `electron-vite build` then build distributable rpm/deb/AppImage via `electron-builder`.
- `npm run dev:server` — start the local release server (`dev/release-server.mjs`) used to test the auto-updater against fake releases.
- Flatpak/Snap: `npm run flatpak-build` / `flatpak-test` / `flatpak-lint` and `snap-build` / `snap-upload` (shell scripts under `dev/`).

There is **no test suite** — `npm test` intentionally exits 1. Don't add references to running tests.

Requires Node 22+ / npm 10+.

## TypeScript & build (important)

The app is **TypeScript bundled with electron-vite**. There is no longer a "run the `.mjs` directly" path.

- Source lives under `src/`: `src/main/` (main process), `src/preload/` (preload scripts), `src/renderer/` (renderer pages + their entry scripts), and `src/shared/` (types shared by preload + renderer). The package is ESM (`"type": "module"`).
- `electron.vite.config.ts` defines three build targets. Output goes to `out/{main,preload,renderer}`; `package.json` `main` points at `out/main/index.js`. **Preload scripts are emitted as `.cjs`** because Electron's sandboxed renderers only accept CommonJS preloads.
- Type checking is separate from bundling: `tsconfig.node.json` (main), `tsconfig.preload.json` (preload, includes the DOM lib for `docs-preload`), `tsconfig.web.json` (renderer), with the root `tsconfig.json` referencing all three. All use **aggressive strict** settings. Run `npm run typecheck` after changes.
- Runtime static assets (icons, etc.) stay in `assets/` and are resolved via helpers in `src/main/lib/resources.ts` — not via `__dirname` paths. `assets/` ships through electron-builder `extraResources`; the renderer copies it via Vite `publicDir`.

## Linting workflow (important)

Linting is driven by custom Node scripts in `dev/scripts/`, **not** by calling `eslint`/`prettier` directly:
- `lint.mjs` collects the relevant file list from git (via `helpers/git.mjs`), filters to `ALLOWED_EXTENSIONS` (`dev/scripts/helpers/constants.mjs`), then runs `eslint -c ./eslint.config.ts --fix` and re-stages.
- The ESLint config is **flat config written in TypeScript** (`eslint.config.ts`), so it must be invoked with `-c ./eslint.config.ts`.
- Husky installs a `pre-commit` hook (committed at `.husky/pre-commit`) running `npm run typecheck` then `npm run lint`. CI (`.github/workflows/ci.yml`) runs typecheck + lint:all + build on push/PR.

## Architecture

All application logic runs in the **Electron main process** (ESM). There is no renderer framework; renderer UI is plain HTML in `src/renderer/` (each page has a sibling `.ts` entry) bundled by electron-vite and driven by preload scripts.

### Wiring (`src/main/index.ts`)
`src/main/index.ts` is the composition root. It:
1. Acquires a single-instance lock (second launch focuses the existing window).
2. Connects to **session D-Bus** to read the freedesktop color-scheme portal for initial theme, then creates the main window.
3. Instantiates every service as a class and wires them together by hand.

Two shared objects are passed into services as the integration layer:
- **`store`** — an `electron-store` instance for persisted state (window position, tabs, options, update metadata).
- **`mainBus`** — a plain Node `EventEmitter` for cross-service events (e.g. `option-changed` → tabs service closes calendar/mail tabs).

The main window is a **`BaseWindow`** (not `BrowserWindow`) with `titleBarStyle: 'hidden'`. Content is composed from `WebContentsView`s: one view renders the custom titlebar (`src/renderer/titlebar.html`), and each tab is its own `WebContentsView`. The Notion website is loaded directly into tab views; the app does not proxy or rewrite Notion's pages.

### Services (`src/main/services/`)
Each file is a single class owning one concern, constructed in `src/main/index.ts`:
- `tabs.ts` — the core. Manages `WebContentsView` tabs, pinned Calendar/Mail/Notes apps, titlebar communication, keyboard shortcuts, icons/titles, and persistence. Largest and most central file.
- `options.ts` — reads the declarative schema in `options.json`, layers defaults < desktop-environment presets (e.g. GNOME) < CLI overrides < stored values, and serves the options window. `getOption` is typed per-option via `OptionValues` in `src/main/types.ts`.
- `update.ts` — wraps `electron-updater`; AppImage gets in-app download/install, other formats defer to the package manager. Honors `--disable-update-functionality`.
- `tray.ts`, `contextMenu.ts`, `notifications.ts`, `changelog.ts`, `windowPosition.ts` — tray icon, right-click menus, native notifications, GitHub changelog fetch, and window geometry persistence.

### Preloads and IPC (`src/preload/`)
- `tab-preload.ts` exposes `window.notionElectronAPI` via `contextBridge` — the full IPC surface between titlebar UI and the main process (add/close/change tab, history, sidebar fold, context menus, etc.).
- `docs-preload.ts` is injected into Notion pages: detects offline state and observes the DOM (sidebar, etc.) to sync titlebar state.
- `options-preload.ts` backs the options window.

The bridge API shapes and IPC payload types are defined in `src/shared/ipc.ts` and reused by both the preloads and the renderer entries (`src/renderer/global.d.ts` types `window.notionElectronAPI`).

Note: the main `BaseWindow` uses `contextIsolation: false`; tab/options windows isolate via `contextBridge` preloads. Match the existing pattern when touching a given window.

### `src/main/lib/`
Reusable helpers, notably a **hand-rolled D-Bus client** (`lib/dbus.ts` + `lib/dbus/`) built on `d-bus-message-protocol` / `d-bus-type-system`. It both monitors the freedesktop appearance portal for live theme changes and registers the D-Bus name `io.github.anechunaev.NotionElectron` so `.desktop` actions (Options/Updates/About, dispatched via `dbus-send`) reach the running app. `lib/shortcuts/` defines the keyboard accelerator map; `lib/image.ts` converts favicons (uses `sharp`/`jimp`); `lib/resources.ts` resolves assets/preloads/renderer pages for dev vs. packaged builds.

### Config files
- `options.json` — declarative options schema (types, defaults, groups) that drives the options UI and `OptionsService`. Add new user-facing settings here (and the matching type in `OptionValues`), not in code.
- CLI flags handled in `OptionsService`: `--hide-on-startup`, `--disable-spellcheck`, `--disable-update-functionality`.
- `electron.vite.config.ts` — main/preload/renderer build config.
- `package.json` `build` block configures `electron-builder` (appId, Linux targets, desktop actions, `files`/`extraResources`, `asarUnpack` for `sharp`); `dbus` block holds the D-Bus name/path/interface read at runtime via `pkg.dbus`.
