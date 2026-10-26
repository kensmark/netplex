<h1 align="center">NetPlex for Windows and macOS</h1>
<p align="center">Your Plex library. Your layout. Your own streaming experience.</p>
<p align="center">
  <a href="https://github.com/kensmark/netplex/releases/tag/v1.5.0-beta.1"><strong>Download desktop installers</strong></a>
  · <a href="#features">Features</a>
  · <a href="#netplex-studio">NetPlex Studio</a>
  · <a href="#development">Development</a>
</p>

NetPlex is a customizable **Windows and macOS desktop client for Plex Media Server**. Browse films and series from your connected servers, build your own home screen, and play original media with the bundled native player.

The interface currently uses Danish labels. No personal library or Plex credentials are included.

## Install

The current release is **1.5.0 beta 1**, introducing the first Mac preview.

| Computer | Download |
| --- | --- |
| Windows x64 | [Windows installer](https://github.com/kensmark/netplex/releases/download/v1.5.0-beta.1/NetPlex-Setup-1.5.0-beta.1.exe) |
| Apple Silicon Mac (M1 or newer) | [Mac arm64 DMG](https://github.com/kensmark/netplex/releases/download/v1.5.0-beta.1/NetPlex-1.5.0-beta.1-macOS-arm64.dmg) |
| Intel Mac | [Mac x64 DMG](https://github.com/kensmark/netplex/releases/download/v1.5.0-beta.1/NetPlex-1.5.0-beta.1-macOS-x64.dmg) |

**Windows:** run the installer, then open NetPlex from the desktop or Start menu.

**macOS 14 Sonoma or newer:** open the DMG, drag NetPlex into Applications, then open it. The Mac preview is ad-hoc signed and **not notarized by Apple**. If macOS blocks the first launch of a download you trust, use **System Settings → Privacy & Security → Open Anyway** after the blocked launch. See [Apple's per-app instructions](https://support.apple.com/en-us/102445). The Windows installer is also unsigned.

Choose **Log ind med Plex**, complete sign-in in your browser, return to NetPlex and select the servers to include. Every user signs in with their own account.

The native player is bundled. **Node.js, Homebrew, terminal commands and a separate player installation are not required.** NetPlex includes no films or access to other libraries. Existing releases remain available under [Releases](https://github.com/kensmark/netplex/releases).

## Features

- **One library, multiple servers.** Include or exclude servers in Settings. Copies with matching global Plex, IMDb, TMDB or TVDB identifiers appear as one title. Details show its available servers and let you choose the playback source.
- **Native playback.** The bundled mpv player handles original MKV/HEVC media, audio tracks, and embedded or external subtitles locally. Windows embeds video in the app; macOS opens a separate NetPlex Player window with native controls. Compatible files can play without asking Plex to convert the video or burn in subtitles.
- **A home screen you control.** Reorder modules, add categories, combine genre, year, rating, actor and director filters, and choose a carousel, grid or vertical poster column for each category. Select a module to reveal its trash icon. Metadata pickers contain names from your own library.
- **Consistent film cards.** Choose posters or landscape artwork, seven size steps, and rounded corners. Title, year and rating stay inside the artwork. Hover or keyboard focus reveals the save icon; click the card for details.
- **Search and browse.** Type directly in the top search field, or press **Ctrl+K** (**⌘K** on Mac). Search across films and series, or use the separate searches and filters inside Film and Serier.
- **Continue watching and your own list.** Resume playback, save titles, and mark them watched. Playback progress syncs to the selected Plex source. Saved lists belong to the current NetPlex installation and Plex account.
- **A quiet full-screen player.** Playback controls, title and track settings hide after inactivity and return with mouse movement. Use Space to pause, arrow keys to seek, F for full screen and M to mute.
- **Responsive desktop layout.** Rows adapt to the available width and keep their height while paging. The interface follows display scaling; layouts have been checked at simulated 3840 × 2160 with 100%, 150% and 200% scaling.

### The default home screen

New installations start with a featured film, Continue Watching, Recently Added films, a series row and saved titles. Empty modules stay hidden. Change the order or replace modules in **NetPlex Studio → Layout**.

## NetPlex Studio

Keep your categories while changing how NetPlex looks.

| Tab | What you can change |
| --- | --- |
| **Layout** | Home modules, order, category rules and library views. Category templates appear inside the selected category's settings. |
| **Temaer** | Four included themes and your own locally saved themes. |
| **Tilpas** | Colors, font and top or side navigation. |
| **Filmkort** | The shared card format, size and corner rounding. |
| **JSON** | Import/export a theme, a layout or a complete design backup. |

Changes preview immediately. **Gem design** saves; **Annullér** restores the saved design. A theme changes appearance while preserving your layout and category rules.

Share a `.theme.netplex.json` or `.layout.netplex.json` file with a friend, or give it to ChatGPT as a starting point for a new design. Design files are validated data rather than executable code and do not contain Plex login details. The recipient's own library supplies the films.

## Playback and privacy

NetPlex runs locally on your computer. Plex sign-in opens Plex's own authentication page. The local backend keeps server tokens away from the interface and native player. Settings, saved designs and personal themes live in `%APPDATA%/NetPlex Desktop` on Windows or `~/Library/Application Support/NetPlex Desktop` on macOS and are excluded from the repository and installers.

This is an independent Plex client. Normal Plex permissions, server availability and remote-access requirements still apply. Native playback currently uses **original quality**, so your connection and computer must handle the original bitrate and codecs. Multipart media is not yet supported as a continuous film. This version has no automatic updater; use the installer for updates.

## Development

The source in this repository builds the **Windows and macOS desktop apps**. `src/` and `public/` provide its embedded interface; `server/` provides its local Plex engine. A separate hosted website is not part of this repository.

Use **Windows x64** or **macOS 14+ (Apple Silicon/Intel)**, Git, and Node.js **24 LTS** (minimum 22.12). Build each platform on its native operating system.

```powershell
git clone https://github.com/kensmark/netplex.git
cd netplex
npm ci
npm --prefix desktop ci
npm run setup:desktop
npm start
```

If Electron installation scripts were disabled, run `node desktop/node_modules/electron/install.js` once. The pinned mpv download is checked against the SHA-256 in `desktop/player-release.json` (Windows) or `desktop/player-release.macos.json` (Mac).

Build the standalone application and installer:

```powershell
npm run build:windows  # on Windows
npm run build:mac      # on macOS
```

Outputs:

- `Windows/NetPlex-win32-x64/NetPlex.exe` — keep its whole folder together.
- `Windows/Installers/NetPlex-Setup-<version>.exe` — the single file to distribute.
- `Mac/NetPlex-darwin-<arch>/NetPlex.app` — the Mac application.
- `Mac/Installers/NetPlex-<version>-macOS-<arch>.dmg` — drag-to-Applications installer.
- Installer checksum files are generated beside each platform build.

Run checks:

```powershell
npm run check
npm test
npm run test:desktop
npm run test:ui
```

UI tests start isolated app instances with fake Plex servers. They do not need your personal Plex account.

| Directory | Purpose |
| --- | --- |
| `desktop/` | Electron host, platform-specific playback, mpv integration and desktop packaging. |
| `src/` | TypeScript/React interface, Studio and design contracts. |
| `public/` | Embedded interface assets and host integration. |
| `server/` | Local Plex connection, catalog, streaming proxy and design persistence. |
| `designs/` | Included design presets. |
| `tests/`, `desktop/tests/` | Backend, design and native-player tests. |

See [the design architecture](docs/DESIGN-ARCHITECTURE.md), [desktop development notes](desktop/README.md), and [agent instructions](AGENTS.md). Third-party licenses and source references are listed in [desktop/THIRD-PARTY.md](desktop/THIRD-PARTY.md); login posters and fictional demo artwork are described in [ASSETS.md](ASSETS.md).
