# Contributing to Notion Electron

Thanks for your interest in improving Notion Electron! This document explains how to set up a
development environment, the rules your code needs to follow to land cleanly, and how to open a
pull request.

## Scope

Notion Electron is an **unofficial, Linux-only** Electron desktop client that wraps Notion's web
apps (Notion, Calendar, Mail). There is **no Windows or macOS path** by design — please don't open
PRs that add cross-platform support or other operating-system targets, as they're out of scope and
will not be merged.

Notion Electron is a **thin wrapper** around Notion's web apps — it does **not** add new features to
Notion itself. When proposing a new feature, prioritize (in order): first, capabilities the
**official Notion clients** already ship that our Linux shell is missing; then **integrations with
Linux and its desktop environments** (tray, notifications, theming, `.desktop` actions, and similar).
Feature requests that extend Notion's own functionality are out of scope.

Before making any non-trivial change, read **[`docs/architecture.md`](docs/architecture.md)**. It is
the contributor-facing map of how the app is wired and which layer your code belongs in. The rules
summarized below come from it.

## AI-assisted contributions

AI tools are welcome for contributing, but AI-assisted issues and pull requests must be **disclosed**
and held to the same quality bar as any other contribution — you remain accountable for reviewing,
understanding, and verifying what you submit. Read the **[AI usage policy](docs/ai-policy.md)** before
contributing with AI assistance.

## Prerequisites

- **Node.js 22+** and **npm 10+** (CI builds on Node 24).
- A **Linux** development environment with a running **session D-Bus** — the app reads the
  freedesktop appearance portal for theming and registers a bus name for `.desktop` actions, so
  both depend on D-Bus being available.

## Getting started

1. Fork and clone the repository, then install dependencies:

    ```sh
    git clone https://github.com/<your-username>/notion-electron.git
    cd notion-electron
    npm install
    ```

    `npm install` runs two project hooks automatically: `postinstall`
    (`electron-builder install-app-deps`, which rebuilds native modules like `sharp`) and `prepare`
    (installs the Husky pre-commit hook).

2. Run the app locally:

    ```sh
    npm start
    ```

    This runs `APPIMAGE=/ electron-vite dev` — electron-vite bundles the TypeScript sources and
    serves the renderer with HMR. The `APPIMAGE=/` env makes the updater behave as if running in
    AppImage mode. For a production-like run, use `npm run build && npm run preview`.

3. To test the auto-updater against fake releases, start the local release server:

    ```sh
    npm run dev:server
    ```

## Project layout

Detail lives in [`docs/architecture.md`](docs/architecture.md); this is just a map of where things
go. Sources are **TypeScript**, bundled with **electron-vite** into `out/`:

| Path                  | What lives there                                                          |
| --------------------- | ------------------------------------------------------------------------- |
| `src/main/index.ts`   | Composition root — instantiates and wires every service. No logic.        |
| `src/main/services/`  | One class per file, each owning a single concern (tabs, options, …).      |
| `src/main/lib/`       | Reusable helpers — D-Bus client, shortcut map, image conversion, paths.   |
| `src/preload/`        | Preload scripts (the IPC surface for the titlebar, tabs, options).        |
| `src/renderer/`       | Renderer HTML pages + their `.ts` entry scripts (no framework).           |
| `src/shared/`         | Types shared between preload and renderer (the IPC bridge surface).       |
| `assets/`             | Static runtime assets (icons, logos), shipped via `extraResources`.       |
| `options.json`        | Declarative schema for all user-facing settings.                          |
| `electron.vite.config.ts` | Build config for the main / preload / renderer targets.               |
| `tsconfig*.json`      | Strict type-check configs (node / preload / web + root references).       |
| `dev/`                | Build, lint, and packaging scripts (Flatpak/Snap helpers included).       |

## Architectural rules

These are non-negotiable conventions enforced by review (see `docs/architecture.md` for the
reasoning):

- **View and Domain communicate only through Electron IPC.** No other channel crosses that boundary.
- **`src/main/index.ts` only wires things up** — it instantiates services and connects them to the
  data layer. It must not contain application logic.
- **Services never import each other.** They collaborate via **dependency injection** (instances
  passed into constructors) and the **`mainBus`** `EventEmitter` for decoupled events.
- **Persisted state goes through `store`** from a **main-process service** — never write to the
  store from a renderer.
- **User-facing settings go in `options.json`**, then are read via `OptionsService.getOption(id)`.
  Don't hardcode settings in code.
- **One class per file**, and every unit obeys **SOLID**.
- **Per-window isolation differs intentionally.** The main `BaseWindow` runs with
  `contextIsolation: false`; the tab and options windows isolate via `contextBridge` preloads. Match
  the pattern of the window you're touching — don't "fix" one to look like the other.

## Code style and linting

Formatting is handled entirely by tooling — **don't hand-format**. The settled conventions
(`.editorconfig`, `prettier.config.js`) are tabs at width 4, a 120-column print width, single
quotes, semicolons, and trailing commas.

Linting is driven by **custom Node scripts in `dev/scripts/`**, not by calling `eslint`/`prettier`
directly:

- `npm run lint` — lint changed/untracked files (this is what the pre-commit hook runs).
- `npm run lint:all` — lint all git-tracked files.
- `npm run lint:deep` — lint files changed since the merge-base with `main`.

The ESLint config is **flat config written in TypeScript** (`eslint.config.ts`), so it must be
invoked with `-c ./eslint.config.ts` (the scripts already do this). Among other rules it enforces
one class per file (`max-classes-per-file`) and a custom
`publicMethods/public-class-methods-use-this` rule.

A Husky **pre-commit hook runs `npm run lint`** and re-stages the formatted files, so commits are
kept clean automatically. Please **don't bypass it** with `--no-verify`.

## Verifying your changes

There is **no automated test suite** — `npm test` intentionally exits with an error, and you should
not add references to running tests.

Instead, **manually verify** your change on Linux: run `npm start` and exercise the area you touched
(tabs, options window, tray, notifications, and the updater via `npm run dev:server`). Describe what
you tested in your pull request.

## Building and packaging

You usually don't need to build to contribute, but for reference:

- `npm run make` — unpacked Linux x64 build via `electron-packager` into `dist/`.
- `npm run pack` — distributable rpm/deb/AppImage via `electron-builder`.
- Flatpak/Snap helpers live under `dev/` (`npm run flatpak-build`, `npm run snap-build`, …).

CI (`.github/workflows/build.yml`) builds and releases **only on `v*` tags**, so pull requests are
not auto-built — reviewers verify locally.

## Commit messages

Follow the project's commit style (recommended, not CI-enforced):

- Prefix with a lowercase **type**: `feature:`, `fix:`, `refactor:`, `docs:` (and similar).
- Start the summary with a **past-tense verb**: added, fixed, updated, removed, corrected, …

Examples:

```text
fix: Fixed wrong-theme flash on first paint
feature: Added pinned Mail tab persistence
docs: Updated the disable-update-functionality flag description
```

## Pull requests

1. Create a topic branch off `main` (`git checkout -b fix-theme-flash`).
2. Make your change, keeping the PR focused on a single concern.
3. Let the pre-commit hook lint and format your commits.
4. Manually verify the app still works (see above).
5. Open a pull request against `anechunaev/notion-electron:main` with a clear description of **what**
   changed and **why**, plus how you tested it.

Dependency bumps are handled automatically by Dependabot, so you don't need to open PRs for those.

## Reasons to deny an issue or PR

A maintainer may close an issue or pull request — usually with a short explanation — for any of
these reasons. Most map directly to the rules above.

- **Out of scope: cross-platform.** Adds or asks for Windows/macOS (or other non-Linux) support.
- **Out of scope: extends Notion itself.** Adds features to Notion's own functionality rather than
  the Linux wrapper around it.
- **Not a priority.** A new feature that is neither parity with something the official Notion clients
  already ship, nor an integration with Linux and its desktop environments.
- **Breaks the architecture.** Violates a rule in [`docs/architecture.md`](docs/architecture.md) —
  e.g. logic in `src/main/index.ts`, services importing each other, a renderer writing to `store`, or more
  than one class per file.
- **Unfocused PR.** Bundles several unrelated changes instead of one concern.
- **Unverified or non-conforming.** No description of what/why and how it was tested on Linux,
  bypasses the pre-commit lint hook (`--no-verify`), or hand-formats against the code style.
- **Not reproducible (issues).** Missing steps, environment, or expected-vs-actual detail, or a
  speculative/hallucinated report.
- **Undisclosed or low-effort AI output.** See the [AI usage policy](docs/ai-policy.md).
- **Redundant dependency bump.** Dependency updates are handled automatically by Dependabot.

## License

By contributing, you agree that your contributions are licensed under the project's **MIT** license.
