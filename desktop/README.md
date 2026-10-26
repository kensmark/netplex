# NetPlex desktop development

For installation, features and downloads, see the [main README](../README.md).

## Runtime

The Electron host starts an in-process local backend on an available loopback port and loads the embedded interface. The backend manages Plex authentication, selected servers, catalog aggregation, artwork, history and a local stream proxy. The separate browser entry point is not needed by the desktop application.

The interface uses TypeScript and React. Electron runs with context isolation, sandboxing and Node integration disabled in the renderer. A narrow preload bridge exposes playback and desktop operations.

mpv runs as a separate process. A native Windows video surface hosts its output; the interface overlays player controls. Plex credentials remain in the backend. mpv receives a temporary local playback URL rather than the upstream Plex token.

On macOS 14+, mpv uses a separate NetPlex Player window with its own controls, bundled for Apple Silicon and Intel. A private Unix socket inside a mode-0700 temporary directory replaces the Windows named pipe. No Koffi or Win32 native module is loaded on Mac. Closing the player stops the session and saves progress to Plex.

## Setup

Use Windows x64 or macOS 14+ (arm64/x64) with Node.js 24 LTS (minimum 22.12). From the repository root:

```powershell
npm ci
npm --prefix desktop ci
npm run setup:desktop
npm start
```

If dependency installation skipped Electron's download hook:

```powershell
node desktop/node_modules/electron/install.js
```

mpv is pinned in `player-release.json` (Windows) and `player-release.macos.json` (Mac). `npm run setup:desktop` downloads and checks the configured SHA-256. Licenses and source references are in [THIRD-PARTY.md](THIRD-PARTY.md) and `assets/licenses/`.

Development settings default to `desktop/.data`. Tests use `NETPLEX_DATA_DIR` and `NETPLEX_NO_IMPORT=1` to isolate fake accounts. Never commit these local profiles.

## Build

From the repository root:

```powershell
npm run build:windows
```

Or run the separate steps from this directory:

```powershell
npm run build
npm run build:installer
```

`scripts/build.mjs` compiles the interface, assembles the desktop source and runtime dependencies, packages Electron into ASAR, and includes the native module and mpv distribution. Output is `../Windows/NetPlex-win32-x64/`. Close any instance running from that output directory before rebuilding it.

`scripts/installer.mjs` checks the packaged version and rejects personal settings/test paths before building the per-user NSIS installer. Output is `../Windows/Installers/`, including the EXE, a SHA-256 file and installation notes. Users receive one EXE, not a command file. Installers go into GitHub Releases rather than Git history.

On a native Mac, run `npm run build:mac` from the root. This produces `Mac/NetPlex-darwin-<arch>/NetPlex.app` and `Mac/Installers/NetPlex-<version>-macOS-<arch>.dmg`. Build Apple Silicon and Intel separately on native runners; `.github/workflows/desktop-build.yml` checks and builds all three desktop targets and prepares a draft release.

Windows installers are unsigned. Mac previews are ad-hoc signed and are not Developer ID signed or notarized. No signing credentials belong in source control.

## Local data and updates

Installed applications keep settings in `%APPDATA%/NetPlex Desktop` on Windows or `~/Library/Application Support/NetPlex Desktop` on macOS:

- `settings.json` — Plex credentials, selected servers and saved lists.
- `design.json` — the user's active layout and theme.
- `themes.json` — the user's personal theme library.

An update must preserve these files. Uninstalling normally preserves user data as well. The installer contains no account, media, private layout or server configuration. A new computer signs in with its own Plex account.

## Checks

From the repository root:

```powershell
npm run check
npm test
npm run test:desktop
npm run test:ui
```

Desktop tests exercise native command validation, sessions, original streams, HEVC Main 10, EAC3 and local subtitles. UI tests launch separate desktop instances with fixtures to exercise Studio, shared cards, multi-server choices, carousels and search. They do not use the owner's real Plex library.

For a release, run `npm --prefix desktop run test:package` to launch the packaged application with a fresh isolated profile. Additionally, verify the bundled player, test a fresh-profile Plex sign-in screen and verify the installed files/checksum. See [AGENTS.md](../AGENTS.md) for the review, commit, push and release procedure.

## Current playback limits

The native player uses original quality. Decoding support and network bandwidth still matter; selecting a server does not bypass Plex access permissions. Multipart media is not yet played as one continuous film. Updates are installed by running the next installer; there is no automatic updater.
