# Architecture

This document is a contributor-facing map of how **notion-electron** is put together: the
processes it runs, how the main process is wired, and where to add new behaviour. Read it
before making non-trivial changes so your code lands in the right layer and follows the
existing patterns.

> If you only change one thing after reading this: user-facing settings go in
> `options.json`, cross-service events go through `mainBus`, and persisted state goes
> through `store` from a main-process service — never from a renderer.

## Overview

notion-electron is an **unofficial Electron desktop client** that wraps Notion's web apps
(Notion, Calendar, Mail) to give Linux users a native-like shell: custom titlebar,
multi-tab browsing, system tray, native notifications, and self-updating packages. It is
**Linux-only** — there is no Windows/macOS path.

There is **no bundler and no renderer framework**. The package is ESM
(`"type": "module"`, entry point `index.mjs`), all application logic runs in the Electron
**main process**, and renderer UI is plain HTML in `assets/pages/` driven by preload
scripts. Notion's pages are loaded directly into tab views; the app does not proxy or
rewrite them.

## Layered architecture

Above the concrete wiring, the codebase follows a strict **three-layer model**. Keep this
in mind whenever you decide where a piece of code belongs.

```
  ┏━━━━━━━━━┓                 ┏━━━━━━━━━━━━┓
  ┃ Preload ┃ 🠜─[ DOM API ]── ┃ HTML Pages ┃
  ┗━━━━━━━━━┛                 ┗━━━━━━━━━━━━┛
       │
       │                                                              [ VIEW LAYER ]
══[ IPC Bus ]═══════════════════════════════════════════════════════════════════════
       │                                                            [ DOMAIN LAYER ]
       🠟
  ┏━━━━━━━━━━┓                              ┏━━━━━━━━━━━━━━━━━━┓
  ┃ Services ┃ ──[ Dependency Injection ]─🠞 ┃ Index Controller ┃
  ┗━━━━━━━━━━┛                              ┗━━━━━━━━━━━━━━━━━━┛
       │                                              │
       │        ╭────────────────┬────────────────────┤             [ DOMAIN LAYER ]
═══════│════════│════════════════│════════════════════│═════════════════════════════
       │        │                │                    │               [ DATA LAYER ]
       🠟        🠟                🠟                    🠟
  ┏━━━━━━━━━━━━━━━━━━┓       ┏━━━━━━━┓       ┏━━━━━━━━━━━━━━━━┓
  ┃ Persistent Store ┃       ┃ D-Bus ┃       ┃ Options Config ┃
  ┗━━━━━━━━━━━━━━━━━━┛       ┗━━━━━━━┛       ┗━━━━━━━━━━━━━━━━┛
```

- **View layer** — draws the UI and handles user input. It is _only_ the preload scripts
  and the HTML GUI pages, and it runs in the web (renderer) context.
- **Domain layer** — the main application logic, including all Electron integration. It is
  the services plus the index controller, and it runs in the Electron main process.
- **Data layer** — stores, reads, and updates application data.

The rules that hold these layers together:

- **View and Domain communicate _only_ through Electron's IPC bus.** No other channel
  crosses that boundary.
- **The index controller (`index.mjs`) only instantiates services and connects them to the
  Data layer** through gateways and APIs — it is the [composition root](#composition-root-indexmjs)
  and **must not implement any logic** itself.
- **Services never import each other's classes or functions.** They collaborate via
  **Dependency Injection** (instances passed into constructors) and the **`mainBus`** event
  bus for reactive, decoupled data exchange — see [the integration layer](#integration-layer-store-and-mainbus).
- **Data flow runs upward** (Data → Domain → View); **control flow runs downward**.
- **Every unit of code** — module, component, library — **obeys SOLID.**

Each layer maps to specific locations in the tree:

| Layer  | Lives in                                                                                |
| ------ | --------------------------------------------------------------------------------------- |
| View   | `assets/pages/` (HTML pages), `render/` (preload scripts)                               |
| Domain | `services/` (services), `index.mjs` (index controller / entry point)                    |
| Data   | `lib/dbus/` (D-Bus), `options.json` (static options config), the `electron-store` store |

## Process & window model

The app runs the Electron main process plus several web views, each with its own preload:

| Surface       | Host type         | Content                        | Preload                     |
| ------------- | ----------------- | ------------------------------ | --------------------------- |
| Main          | Node.js           | `index.mjs` (composition root) | —                           |
| Titlebar      | `WebContentsView` | `assets/pages/titlebar.html`   | `render/tab-preload.js`     |
| Tab (per tab) | `WebContentsView` | Notion / Calendar / Mail URLs  | `render/docs-preload.js`    |
| Options       | `BrowserWindow`   | `assets/pages/options.html`    | `render/options-preload.js` |

The main window is a **`BaseWindow`** (not a `BrowserWindow`) with
`titleBarStyle: 'hidden'`. Its content is composed from `WebContentsView`s: one renders
the custom titlebar, and **each tab is its own `WebContentsView`** layered into the same
native frame. This layering is the whole reason `BaseWindow` is used — it can host many
web views at once, where `BrowserWindow` hosts a single page.

The **options window is a separate child `BrowserWindow`** (`parent: mainWindow`) that
floats above the main window. It is created hidden and reused — closing it hides it rather
than destroying it (unless the app is actually quitting).

## Composition root (`index.mjs`)

`index.mjs` is the single place where everything is constructed and wired. It is worth
reading top-to-bottom; the sequence matters.

1. **Single-instance lock** — `app.requestSingleInstanceLock()`. A second launch quits
   itself and fires `second-instance`, which restores/focuses the already-running window.
2. **Shared state created at module top level** — the `store` (`electron-store`) and
   `mainBus` (`EventEmitter`) are created _before_ the lock branch, and
   `OptionsService` is instantiated immediately so CLI flags and stored options are
   available during startup.
3. **D-Bus theme query** — `createMonitorBus()` connects to the session bus and issues a
   `Read` on `org.freedesktop.portal.Settings` for `org.freedesktop.appearance` /
   `color-scheme`. This drives the initial background color.
4. **Synchronization gate** — `Promise.all([themeProxyPromise, app.whenReady()])` waits
   for _both_ the theme query and Electron readiness before creating the main window. This
   is what prevents a wrong-theme background flash on first paint.
5. **Services constructed and wired by hand** — `TabService` and `WindowPositionService`
   are created against the main window; then a deferred `setTimeout(initApp, 1)` creates
   the options `BrowserWindow` and the services that depend on it (`UpdateService`,
   `TrayService`, `ContextMenuService`, `NotificationService`, `ChangelogService`). The
   1 ms defer guarantees the main window's internal state is fully initialized before
   dependent services reference it.
6. **D-Bus desktop actions** — `onDBusSignal('Options' | 'Updates' | 'About', …)` wires
   `.desktop` file Actions to show the corresponding tab in the options window.

## Integration layer: `store` and `mainBus`

Services are plain classes that don't know about each other. They integrate through two
shared objects passed into their constructors:

- **`store`** — a single `electron-store` instance backing _all_ persisted state: window
  position, open/pinned tabs, option values, and update metadata. **Renderers never touch
  the store directly** — every read/write goes through a main-process service over IPC.
- **`mainBus`** — a plain Node `EventEmitter` for cross-service events. The canonical
  example: `OptionsService.setOption()` emits `option-changed`, and `TabService` listens
  for it to close the Calendar/Mail pinned tabs when `tabs-show-calendar` /
  `tabs-show-mail` are turned off.

## Services (`services/`)

Each file is one class owning one concern, constructed in `index.mjs`:

| Service                 | File                          | Responsibility                                                                  |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `TabService`            | `services/tabs.mjs`           | Core. `WebContentsView` tabs, pinned apps, titlebar IPC, shortcuts, persistence |
| `OptionsService`        | `services/options.mjs`        | Reads `options.json`, layers option sources, serves the options window          |
| `UpdateService`         | `services/update.mjs`         | Wraps `electron-updater`; AppImage vs. package-manager update paths             |
| `TrayService`           | `services/tray.mjs`           | System tray icon and menu                                                       |
| `ContextMenuService`    | `services/contextMenu.mjs`    | Right-click context menus                                                       |
| `NotificationService`   | `services/notifications.mjs`  | Native OS notifications                                                         |
| `ChangelogService`      | `services/changelog.mjs`      | Fetches GitHub release notes                                                    |
| `WindowPositionService` | `services/windowPosition.mjs` | Persists and restores window geometry                                           |

Things to know when touching these:

- **`tabs.mjs` is the largest and most central file.** The base Notion app is internally
  the `notes` app (`HOME_PAGE = https://www.notion.com/login`); the two optional pinned
  apps are `calendar` (`calendar.notion.so`) and `mail` (`mail.notion.so`). Tab → app
  classification is URL/host based (see `#getAppForUrl`-style logic and `AUTH_HOSTS`).
- **`options.mjs` layers four sources.** Effective value precedence, lowest to highest:
  `options.json` default **<** desktop-environment preset (`#DE_PRESETS`, e.g. GNOME) **<**
  stored value **<** CLI override. `getOption()` returns CLI overrides directly; everything
  else flows through `getPersistentOption()` → `store.get(id, fallback)`.
- **`update.mjs` splits by package format.** AppImage gets in-app download/install; other
  formats (rpm/deb/Flatpak/Snap) defer to the package manager. It honors the
  `--disable-update-functionality` flag / `disable-update-functionality` option.

## Preloads & IPC (`render/`)

There are two different security postures here — match the one already used by the window
you are touching:

- **`tab-preload.js`** exposes `window.notionElectronAPI` via `contextBridge` — the full
  IPC surface between the titlebar UI and the main process. It is split into **commands**
  (`addTab`, `closeTab`, `changeTab`, `setUrl`, `historyBack/Forward`, `foldSidebar`,
  `toggleSidebar`, `togglePinTab`, `showContextMenu`, `requestGlobalOptions`,
  `notifyReady`, …) and **subscriptions** (`subscribeOnTabInfo`,
  `subscribeOnSidebarChange`, `subscribeOnGlobalOptions`, `subscribeOnAction`, …).
- **`docs-preload.js`** is injected into Notion pages. It uses `ipcRenderer` **directly**,
  without a `contextBridge` wrapper — acceptable because Notion URLs are trusted
  first-party content, not arbitrary user input. It detects offline state and observes the
  page DOM (sidebar, etc.) to keep the titlebar in sync.
- **`options-preload.js`** backs the options window's IPC.

> **Per-window isolation differs and is intentional.** The main `BaseWindow` runs with
> `contextIsolation: false`; the tab and options windows isolate via `contextBridge`
> preloads. When you add IPC, follow the pattern of the specific window you are in — don't
> "fix" one to match the other.

## D-Bus integration (`lib/dbus.mjs`, `lib/dbus/`)

The app ships a **hand-rolled D-Bus client** built on `d-bus-message-protocol` /
`d-bus-type-system` (there is no high-level D-Bus dependency). It does two jobs:

1. **Live theme** — monitors the freedesktop appearance portal so the app follows the
   system color-scheme without a restart (and reads it once at startup for the initial
   background color, see the composition root above).
2. **Desktop actions** — registers the bus name `io.github.anechunaev.NotionElectron`
   (read at runtime from `pkg.dbus`) so `.desktop` file Actions — dispatched via
   `dbus-send` — reach the running instance. These map to the `onDBusSignal('Options' |
'Updates' | 'About', …)` handlers in `index.mjs`.

Related helpers: `lib/shortcuts/` defines the keyboard accelerator map; `lib/image.mjs`
converts favicons (uses `sharp`/`jimp`); `lib/dateFormat.mjs` formats changelog dates.

## Config & build files

- **`options.json`** — the declarative options schema (id → name, group, type, default).
  It drives both the options UI and `OptionsService`. **Add new user-facing settings here**,
  then read them with `optionsService.getOption(id)` — do not hardcode settings in code.
- **CLI flags** (handled in `OptionsService`): `--hide-on-startup`,
  `--disable-spellcheck`, `--disable-update-functionality`. Each maps to a corresponding
  option id as a CLI override.
- **`package.json`**:
    - `build` block — `electron-builder` config: `appId`, Linux targets, `.desktop`
      Actions, and `asarUnpack` (e.g. for `sharp`).
    - `dbus` block — the D-Bus `name` / `path` / `interface`, read at runtime via `pkg.dbus`.
    - `repository.owner` / `repository.name` — used by `ChangelogService` and the updater.

## Where do I add…?

| You want to…                                 | Do this                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Add a user-facing setting                    | Add it to `options.json`; read via `OptionsService.getOption(id)`       |
| React to a setting change in another service | Listen for `option-changed` on `mainBus`                                |
| Persist some state                           | Write through a service to `store` — never from a renderer              |
| Add titlebar ↔ main behaviour                | Add the method to `render/tab-preload.js` and the handler in `tabs.mjs` |
| Add a whole new concern                      | New class in `services/`, constructed and wired in `index.mjs`          |
| Add a `.desktop` action                      | Register it in `package.json` `build` + handle it via `onDBusSignal`    |

## Build, lint & tests

- **Run locally:** `npm start` (`APPIMAGE=/ electron .` — the env enables AppImage updater
  mode). Requires Node 22+ / npm 10+.
- **Lint:** `npm run lint` (changed/untracked files), `npm run lint:all` (all tracked),
  `npm run lint:deep` (since merge-base). Linting is driven by Node scripts in
  `dev/scripts/`, not by calling `eslint`/`prettier` directly, and the ESLint config is
  **flat config written in TypeScript** (`eslint.config.ts`), invoked with
  `-c ./eslint.config.ts`. A Husky `pre-commit` hook runs `npm run lint`.
- **Package:** `npm run make` (unpacked build via `electron-packager`) or `npm run pack`
  (rpm/deb/AppImage via `electron-builder`). Flatpak/Snap helpers live under `dev/`.
- **Updater testing:** `npm run dev` starts a local release server
  (`dev/release-server.mjs`) to test the auto-updater against fake releases.
- **There is no test suite** — `npm test` intentionally exits 1. Don't add references to
  running tests.
