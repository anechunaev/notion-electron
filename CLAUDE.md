# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An unofficial Electron desktop client that wraps Notion's web apps (Notion, Calendar, Mail) to give Linux users a native-like experience: custom titlebar, multi-tab browsing, system tray, native notifications, and self-updating packages. Linux-only — there is no Windows/macOS path.

## Commands

- `npm start` — run the app locally (`APPIMAGE=/ electron .`). The `APPIMAGE=/` env is what the updater uses to detect AppImage mode.
- `npm run lint` — ESLint `--fix` + Prettier on **changed/untracked files only** (not the whole tree). This is the pre-commit hook.
- `npm run lint:all` — same but across all git-tracked files.
- `npm run lint:deep` — lint files changed since the merge-base with the main branch.
- `npm run make` — package an unpacked Linux x64 build via `electron-packager` into `dist/`.
- `npm run pack` — build distributable rpm/deb/AppImage via `electron-builder`.
- `npm run dev` — start the local release server (`dev/release-server.mjs`) used to test the auto-updater against fake releases.
- Flatpak/Snap: `npm run flatpak-build` / `flatpak-test` / `flatpak-lint` and `snap-build` / `snap-upload` (shell scripts under `dev/`).

There is **no test suite** — `npm test` intentionally exits 1. Don't add references to running tests.

Requires Node 22+ / npm 10+.

## Linting workflow (important)

Linting is driven by custom Node scripts in `dev/scripts/`, **not** by calling `eslint`/`prettier` directly:
- `lint.mjs` collects the relevant file list from git (via `helpers/git.mjs`), filters to `ALLOWED_EXTENSIONS` (`dev/scripts/helpers/constants.mjs`), then runs `eslint -c ./eslint.config.ts --fix` and re-stages.
- The ESLint config is **flat config written in TypeScript** (`eslint.config.ts`), so it must be invoked with `-c ./eslint.config.ts`.
- Husky installs a `pre-commit` hook running `npm run lint` (set up by `dev/scripts/hooks/install.mjs` / `prepare`).

## Architecture

Everything runs in the **Electron main process** (ESM — the package is `"type": "module"`, entry is `index.mjs`). There is no bundler and no renderer framework; renderer UI is plain HTML in `assets/pages/` driven by preload scripts.

### Wiring (`index.mjs`)
`index.mjs` is the composition root. It:
1. Acquires a single-instance lock (second launch focuses the existing window).
2. Connects to **session D-Bus** to read the freedesktop color-scheme portal for initial theme, then creates the main window.
3. Instantiates every service as a class and wires them together by hand.

Two shared objects are passed into services as the integration layer:
- **`store`** — an `electron-store` instance for persisted state (window position, tabs, options, update metadata).
- **`mainBus`** — a plain Node `EventEmitter` for cross-service events (e.g. `option-changed` → tabs service closes calendar/mail tabs).

The main window is a **`BaseWindow`** (not `BrowserWindow`) with `titleBarStyle: 'hidden'`. Content is composed from `WebContentsView`s: one view renders the custom titlebar (`assets/pages/titlebar.html`), and each tab is its own `WebContentsView`. The Notion website is loaded directly into tab views; the app does not proxy or rewrite Notion's pages.

### Services (`services/`)
Each file is a single class owning one concern, constructed in `index.mjs`:
- `tabs.mjs` — the core. Manages `WebContentsView` tabs, pinned Calendar/Mail/Notes apps, titlebar communication, keyboard shortcuts, icons/titles, and persistence. Largest and most central file.
- `options.mjs` — reads the declarative schema in `options.json`, layers defaults < desktop-environment presets (e.g. GNOME) < CLI overrides < stored values, and serves the options window.
- `update.mjs` — wraps `electron-updater`; AppImage gets in-app download/install, other formats defer to the package manager. Honors `--disable-update-functionality`.
- `tray.mjs`, `contextMenu.mjs`, `notifications.mjs`, `changelog.mjs`, `windowPosition.mjs` — tray icon, right-click menus, native notifications, GitHub changelog fetch, and window geometry persistence.

### Preloads and IPC (`render/`)
- `tab-preload.js` exposes `window.notionElectronAPI` via `contextBridge` — the full IPC surface between titlebar UI and the main process (add/close/change tab, history, sidebar fold, context menus, etc.).
- `docs-preload.js` is injected into Notion pages: detects offline state and observes the DOM (sidebar, etc.) to sync titlebar state.
- `options-preload.js` backs the options window.

Note: the main `BaseWindow` uses `contextIsolation: false`; tab/options windows isolate via `contextBridge` preloads. Match the existing pattern when touching a given window.

### `lib/`
Reusable helpers, notably a **hand-rolled D-Bus client** (`lib/dbus.mjs` + `lib/dbus/`) built on `d-bus-message-protocol` / `d-bus-type-system`. It both monitors the freedesktop appearance portal for live theme changes and registers the D-Bus name `io.github.anechunaev.NotionElectron` so `.desktop` actions (Options/Updates/About, dispatched via `dbus-send`) reach the running app. `lib/shortcuts/` defines the keyboard accelerator map; `lib/image.mjs` converts favicons (uses `sharp`/`jimp`).

### Config files
- `options.json` — declarative options schema (types, defaults, groups) that drives the options UI and `OptionsService`. Add new user-facing settings here, not in code.
- CLI flags handled in `OptionsService`: `--hide-on-startup`, `--disable-spellcheck`, `--disable-update-functionality`.
- `package.json` `build` block configures `electron-builder` (appId, Linux targets, desktop actions, `asarUnpack` for `sharp`); `dbus` block holds the D-Bus name/path/interface read at runtime via `pkg.dbus`.
