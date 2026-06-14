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

The sources are **TypeScript bundled with electron-vite** (no renderer framework). The
package is ESM (`"type": "module"`); sources live under `src/` and compile to `out/`
(`main` → `out/main/index.js`). All application logic runs in the Electron **main
process**, and renderer UI is plain HTML in `src/renderer/` (each page has a sibling `.ts`
entry) driven by preload scripts. Notion's pages are loaded directly into tab views; the
app does not proxy or rewrite them.

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
  the services plus the index controller, and it runs in the Electron main process. Domain
  logic is split by statefulness: **services hold state**, while the **stateless functions
  live in libraries** (`src/main/lib/`).
- **Data layer** — stores, reads, and updates application data.

The rules that hold these layers together:

- **View and Domain communicate _only_ through Electron's IPC bus.** No other channel
  crosses that boundary.
- **The index controller (`src/main/index.ts`) only instantiates services and connects them to the
  Data layer** through gateways and APIs — it is the [composition root](#composition-root-srcmainindexts)
  and **must not implement any logic** itself.
- **Services never import each other's classes or functions.** They collaborate via
  **Dependency Injection** (instances passed into constructors) and the **`mainBus`** event
  bus for reactive, decoupled data exchange — see [the integration layer](#integration-layer-store-and-mainbus).
- **Domain logic lives in services and libraries.** Services hold state; `src/main/lib/`
  holds stateless functions. Put a piece of logic in a library function when it needs no
  service state, and in a service when it reads or mutates state.
- **Data flow runs upward** (Data → Domain → View); **control flow runs downward**.
- **Every unit of code** — module, component, library — **obeys SOLID.**

Each layer maps to specific locations in the tree:

| Layer  | Lives in                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------ |
| View   | `src/renderer/` (HTML pages + entry scripts), `src/preload/` (preload scripts)                   |
| Domain | `src/main/services/` (services), `src/main/index.ts` (index controller / entry point)            |
| Data   | `src/main/lib/dbus/` (D-Bus), `options.json` (static options config), the `electron-store` store |

## Process & window model

The app runs the Electron main process plus several web views, each with its own preload:

| Surface       | Host type         | Content                            | Preload                      |
| ------------- | ----------------- | ---------------------------------- | ---------------------------- |
| Main          | Node.js           | `src/main/index.ts` (composition)  | —                            |
| Titlebar      | `WebContentsView` | `src/renderer/titlebar.html`       | `src/preload/tab-preload.ts` |
| Tab (per tab) | `WebContentsView` | Notion / Calendar / Mail URLs      | `src/preload/docs-preload.ts`|
| Options       | `BrowserWindow`   | `src/renderer/options.html`        | `src/preload/options-preload.ts` |

The main window is a **`BaseWindow`** (not a `BrowserWindow`) with
`titleBarStyle: 'hidden'`. Its content is composed from `WebContentsView`s: one renders
the custom titlebar, and **each tab is its own `WebContentsView`** layered into the same
native frame. This layering is the whole reason `BaseWindow` is used — it can host many
web views at once, where `BrowserWindow` hosts a single page.

The **options window is a separate child `BrowserWindow`** (`parent: mainWindow`) that
floats above the main window. It is created hidden and reused — closing it hides it rather
than destroying it (unless the app is actually quitting).

## Composition root (`src/main/index.ts`)

`src/main/index.ts` is the single place where everything is constructed and wired. It is worth
reading top-to-bottom; the sequence matters.

1. **Single-instance lock** — `app.requestSingleInstanceLock()`. A second launch quits
   itself and fires `second-instance`, which restores/focuses the already-running window.
2. **Shared state created at module top level** — the `store` (`electron-store`) and
   `mainBus` (`EventEmitter`) are created _before_ the lock branch, and `OptionsService`
   and `ThemeService` are instantiated immediately so CLI flags, stored options, and the
   theme decision are available during startup.
3. **D-Bus theme query** — `createMonitorBus()` connects to the session bus; the actual
   `Read` on `org.freedesktop.portal.Settings` for `org.freedesktop.appearance` /
   `color-scheme` lives in **`ThemeService.queryColorScheme()`**. Parsing the reply and
   choosing the background color are `ThemeService` concerns, not the controller's.
4. **Synchronization gate** — `Promise.all([themeProxyPromise, app.whenReady()])` waits
   for _both_ the theme query and Electron readiness before creating the main window;
   `ThemeService.resolveBackgroundColor()` then computes the color. This is what prevents
   a wrong-theme background flash on first paint.
5. **Services constructed and wired by hand** — `TabService`, `WindowPositionService`, and
   `MainWindowService` are created against the main window; then a deferred
   `setTimeout(initApp, 1)` creates the options `BrowserWindow` and the services that
   depend on it (`UpdateService`, `TrayService`, `ContextMenuService`,
   `NotificationService`, `ChangelogService`). The 1 ms defer guarantees the main window's
   internal state is fully initialized before dependent services reference it. The
   controller itself holds **no behaviour** — theme resolution lives in `ThemeService`,
   window-lifecycle handling (minimize/close/quit) in `MainWindowService`.
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

## Services (`src/main/services/`)

Each file is one class owning one concern, constructed in `src/main/index.ts`:

| Service                 | File                                   | Responsibility                                                                  |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `TabService`            | `src/main/services/tabs.ts`            | Core. Source of truth for tabs (`WebContentsView`s, order, app, selection)      |
| `OptionsService`        | `src/main/services/options.ts`         | Reads `options.json`, layers option sources, serves the options window          |
| `UpdateService`         | `src/main/services/update.ts`          | Wraps `electron-updater`; AppImage vs. package-manager update paths             |
| `ThemeService`          | `src/main/services/theme.ts`           | D-Bus color-scheme query + initial background-color decision                    |
| `MainWindowService`     | `src/main/services/mainWindow.ts`      | Main/options window lifecycle (hide-to-tray, hide-on-close, quit)               |
| `TrayService`           | `src/main/services/tray.ts`            | System tray icon and menu                                                       |
| `ContextMenuService`    | `src/main/services/contextMenu.ts`     | Right-click context menus                                                       |
| `NotificationService`   | `src/main/services/notifications.ts`   | Native OS notifications                                                         |
| `ChangelogService`      | `src/main/services/changelog.ts`       | Gateway: fetches GitHub release notes (markup is built in the options view)     |
| `WindowPositionService` | `src/main/services/windowPosition.ts`  | Persists and restores window geometry                                           |

`TabService` delegates two concerns to collaborators: **`TabLayout`** (`tabLayout.ts`,
view geometry) and **`TabPersistence`** (`tabPersistence.ts`, the `electron-store` tab
schema). `ContextMenuService` depends on the narrow `TabReader` / `TabCommands` interfaces
(`tabs.types.ts`), not the concrete `TabService`.

Things to know when touching these:

- **`tabs.ts` is the largest and most central file, and the single source of truth for
  tabs.** It owns tab identity (it generates ids), order, app classification, pinned state,
  and selection; it pushes the whole picture to the titlebar as a `tabs-state` payload and
  acts on intents the titlebar sends back (see _Preloads & IPC_). The wrapped apps —
  `notes` (base, `HOME_PAGE`), `calendar`, `mail` — are defined once as data in
  **`src/shared/apps.ts`** (`APP_DEFINITIONS`, `getAppFromUrl`), imported by both the main
  process and the titlebar renderer so classification never drifts. The auth-popup host
  list lives in `lib/windowOpenPolicy.ts`.
- **`options.ts` layers four sources.** Effective value precedence, lowest to highest:
  `options.json` default **<** desktop-environment preset (`#DE_PRESETS`, e.g. GNOME) **<**
  stored value **<** CLI override. `getOption()` returns CLI overrides directly; everything
  else flows through `getPersistentOption()` → `store.get(id, fallback)`.
- **`update.ts` splits by package format.** AppImage gets in-app download/install; other
  formats (rpm/deb/Flatpak/Snap) defer to the package manager. It honors the
  `--disable-update-functionality` flag / `disable-update-functionality` option. Pure
  helpers live in `lib/` (`semver.ts`, `bytes.ts`); quit/relaunch go through `lib/quit.ts`
  (`quitApp` / `relaunchApp`), the single place that sets `app.isQuiting`.
- **Changelog rendering is split by layer.** `ChangelogService.fetch()` is a pure data
  gateway (raw GitHub releases); `UpdateService` forwards a `ChangelogItem[]` view-model
  (with the OS-formatted date — formatting shells out via `date`, so it stays in main) and
  the options renderer builds the HTML markup.

## Preloads & IPC (`src/preload/`)

There are two different security postures here — match the one already used by the window
you are touching:

- **`tab-preload.ts`** exposes `window.notionElectronAPI` via `contextBridge` — the full
  IPC surface between the titlebar UI and the main process. Because the main process is the
  source of truth for tabs, the surface is **intents up, state down**:
    - **Commands** (user intents) — `selectTab`, `addTab`, `closeTab`, `closeCurrentTab`,
      `closeOtherTabs`, `closeAllTabs`, `nextTab`, `previousTab`, `reorderTabs`,
      `historyBack/Forward`, `foldSidebar`, `toggleSidebar`, `showContextMenu`,
      `requestGlobalOptions`, `notifyReady`, … The titlebar never mutates tab state itself;
      it asks, and re-renders from what it gets back.
    - **Subscriptions** (pushed state) — `subscribeOnTabsState` (the authoritative ordered
      tab list + current selection + nav availability, which the titlebar reconciles its
      DOM against), `subscribeOnTabInfo` (incremental title/icon/nav updates),
      `subscribeOnSidebarChange`, `subscribeOnGlobalOptions`, `subscribeOnAction`, …
    - Tab context-menu actions are handled in the main process (`ContextMenuService` calls
      `TabService` directly); there is no render-side command round-trip.
- **`docs-preload.ts`** is injected into Notion pages. It uses `ipcRenderer` **directly**,
  without a `contextBridge` wrapper — acceptable because Notion URLs are trusted
  first-party content, not arbitrary user input. It detects offline state and observes the
  page DOM (sidebar, etc.) to keep the titlebar in sync.
- **`options-preload.ts`** backs the options window's IPC.

The bridge API shapes and IPC payload types live in `src/shared/ipc.ts`, shared by the
preloads and the renderer entries (`src/renderer/global.d.ts` types `window.notionElectronAPI`).

> **Per-window isolation differs and is intentional.** The main `BaseWindow` runs with
> `contextIsolation: false`; the tab and options windows isolate via `contextBridge`
> preloads. When you add IPC, follow the pattern of the specific window you are in — don't
> "fix" one to match the other.

## D-Bus integration (`src/main/lib/dbus.ts`, `src/main/lib/dbus/`)

The app ships a **hand-rolled D-Bus client** built on `d-bus-message-protocol` /
`d-bus-type-system` (there is no high-level D-Bus dependency). It does two jobs:

1. **Live theme** — monitors the freedesktop appearance portal so the app follows the
   system color-scheme without a restart (and reads it once at startup for the initial
   background color, see the composition root above).
2. **Desktop actions** — registers the bus name `io.github.anechunaev.NotionElectron`
   (read at runtime from `pkg.dbus`) so `.desktop` file Actions — dispatched via
   `dbus-send` — reach the running instance. These map to the `onDBusSignal('Options' |
'Updates' | 'About', …)` handlers in `src/main/index.ts`.

Related helpers: `lib/shortcuts/` defines the keyboard accelerator map; `lib/image.ts`
converts favicons (uses `sharp`/`jimp`); `lib/dateFormat.ts` formats changelog dates;
`lib/resources.ts` resolves assets/preloads/renderer pages for dev vs. packaged builds.

## Config & build files

- **`options.json`** — the declarative options schema (id → name, group, type, default).
  It drives both the options UI and `OptionsService`. **Add new user-facing settings here**,
  then read them with `optionsService.getOption(id)` — do not hardcode settings in code.
- **CLI flags** (handled in `OptionsService`): `--hide-on-startup`,
  `--disable-spellcheck`, `--disable-update-functionality`. Each maps to a corresponding
  option id as a CLI override.
- **`electron.vite.config.ts`** — electron-vite build config for the three targets
  (main / preload / renderer). Output goes to `out/`; preloads are emitted as `.cjs`.
- **`tsconfig*.json`** — strict type-check projects: `tsconfig.node.json` (main),
  `tsconfig.preload.json` (preload + DOM lib), `tsconfig.web.json` (renderer), and the root
  `tsconfig.json` referencing all three. Run with `npm run typecheck`.
- **`package.json`**:
    - `main` — points at the built `out/main/index.js`.
    - `build` block — `electron-builder` config: `appId`, Linux targets, `.desktop`
      Actions, `files` / `extraResources`, and `asarUnpack` (e.g. for `sharp`).
    - `dbus` block — the D-Bus `name` / `path` / `interface`, read at runtime via `pkg.dbus`.
    - `repository.owner` / `repository.name` — used by `ChangelogService` and the updater.

## Where do I add…?

| You want to…                                 | Do this                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Add a user-facing setting                    | Add it to `options.json`; read via `OptionsService.getOption(id)`       |
| React to a setting change in another service | Listen for `option-changed` on `mainBus`                                |
| Persist some state                           | Write through a service to `store` — never from a renderer              |
| Add titlebar ↔ main behaviour                | Add the method to `src/preload/tab-preload.ts` (+ its type in `src/shared/ipc.ts`) and the handler in `tabs.ts` |
| Add a whole new concern                      | New class in `src/main/services/`, constructed and wired in `src/main/index.ts` |
| Add a `.desktop` action                      | Register it in `package.json` `build` + handle it via `onDBusSignal`    |

## Build, lint & tests

- **Run locally:** `npm start` (`APPIMAGE=/ electron-vite dev` — HMR for the renderer; the
  env enables AppImage updater mode). For a production-like run: `npm run build && npm run
  preview`. Requires Node 22+ / npm 10+.
- **Type check:** `npm run typecheck` (`tsc --noEmit` over the three tsconfig projects).
  Bundling (electron-vite/esbuild) does not type-check, so this is the type gate.
- **Lint:** `npm run lint` (changed/untracked files), `npm run lint:all` (all tracked),
  `npm run lint:deep` (since merge-base). Linting is driven by Node scripts in
  `dev/scripts/`, not by calling `eslint`/`prettier` directly, and the ESLint config is
  **flat config written in TypeScript** (`eslint.config.ts`), invoked with
  `-c ./eslint.config.ts`. A Husky `pre-commit` hook runs `npm run typecheck` then
  `npm run lint`; CI (`.github/workflows/ci.yml`) runs typecheck + lint:all + build.
- **Package:** `npm run make` (unpacked build via `electron-packager`) or `npm run pack`
  (rpm/deb/AppImage via `electron-builder`); both run `electron-vite build` first. Flatpak/Snap
  helpers live under `dev/`.
- **Updater testing:** `npm run dev:server` starts a local release server
  (`dev/release-server.mjs`) to test the auto-updater against fake releases.
- **There is no test suite** — `npm test` intentionally exits 1. Don't add references to
  running tests.
