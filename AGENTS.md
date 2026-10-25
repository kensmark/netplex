# NetPlex agent instructions

## Scope

This repository is the Windows x64 desktop application at `https://github.com/kensmark/netplex.git`. The default branch is `main`. Keep the application usable by installing one EXE; end users must not need Node.js, a terminal, or a command file.

`src/`, `public/` and `server/` are required parts of the desktop app. Electron embeds the interface and starts the local Plex backend. Do not delete or omit them because their names resemble a website. The separate browser launcher `Start NetPlex.cmd` and `server/index.js` may exist on the owner's computer but are intentionally untracked. Preserve them locally and never force-add them. Do not publish a website or enable GitHub Pages.

Read `README.md`, `desktop/README.md` and `docs/DESIGN-ARCHITECTURE.md` before changing the relevant architecture. This AGENTS.md gives workflow guidance, not standing authorization to publish. Only push, create a release or message other people when the user has authorized that action in the current task.

## Run and validate

Use Windows x64 with Node.js 24 LTS (minimum 22.12). From the repository root:

```powershell
npm ci
npm --prefix desktop ci
npm run setup:desktop
npm start
```

`npm run setup:desktop` downloads the pinned mpv build and verifies its SHA-256. Do not replace it with an unverified binary. If Electron's installation hook was disabled, run `node desktop/node_modules/electron/install.js`.

For relevant code changes run `npm run check` and `npm test`. For playback or native-host changes also run `npm run test:desktop`. For interface, Studio or navigation changes run `npm run test:ui`. Windows UI tests launch Electron with isolated profiles and fake Plex servers. Do not test mutations against the owner's real library. Documentation-only changes need link/image checks, not a full player rebuild.

Use the existing single shared FilmCard for home, Film, Serier and Din liste. Keep layout and theme imports separate, preserve saved user configuration, and keep progress bars from changing card/row height. UI copy is currently Danish.

## Personal data must stay local

Never commit or upload `.netplex/`, `desktop/.data/`, `%APPDATA%/NetPlex Desktop`, settings, access tokens, server addresses, private identifiers, personal designs, themes or lists. Read a secret only when needed and never print its value. Plex server tokens can appear in `connection.token`, `account.token` and **each `servers[].token`**, including inside older saved configurations.

Do not commit `node_modules/`, `Windows/`, `desktop/vendor/`, `desktop/.cache/`, `test-results/`, local tool downloads, signing keys, generated UI bundles or generated validators. `.gitignore` documents the exclusions. Use only fictional demo content for repository screenshots; do not publish real account names, film libraries or Plex server labels.

Before every push inspect staged filenames and run:

```powershell
git diff --cached --stat
git diff --cached --check
node scripts/check-publication.mjs
```

The publication check scans staged blobs, not just working files. It checks forbidden paths, unexpected large files, credential patterns and locally stored Plex tokens without printing them. A scan is an additional safeguard; still review every staged path. Never bypass a failure by disabling the scan, weakening `.gitignore`, or force-adding personal files.

## Git and push

1. Inspect `git status --short`, the current branch, and `git remote -v`. Expected origin is exactly `https://github.com/kensmark/netplex.git` (or its equivalent SSH URL). Do not silently change a different origin.
2. Fetch `origin` and inspect the target branch before publishing. Preserve existing remote history and the user's unrelated changes. Never force-push, delete branches, rewrite published commits or reset the working tree to resolve divergence.
3. By default use a `codex/` branch for new work. If the user explicitly asks for a direct push to `main`, follow that instruction and use a normal fast-forward push. Do not rebase or merge unrelated changes automatically.
4. Stage an explicit list of intended source/docs files. Avoid `git add .` and `git add -A`, especially in the owner's working directory, which also contains local data and installer outputs.
5. Review the staged diff, run the publication check and the relevant tests, then commit with a concise message describing the resulting behavior. Keep the configured commit identity. Do not put credentials in remote URLs, commands, logs, commits or Git configuration.
6. Push the exact authorized branch, for example `git push -u origin main` when the user explicitly requested `main`. Verify the remote head matches the local commit. Report the commit/repository link and any checks that could not run.

GitHub's connector login and local Git credentials are separate. On authentication failure, use the normal Git Credential Manager or GitHub CLI sign-in flow. Do not ask the user to paste a token into chat. Tell the user if browser sign-in is required and continue independent preparation while waiting.

## Windows releases and installers

Built installers belong in **GitHub Releases**, never in Git history. Do not rename an old installer to imply a newer build. A release must refer to the commit that produced the application, and its tag/version must agree with root `package.json`, root lockfile, `desktop/package.json`, desktop lockfile and `desktop/preload.cjs`.

```powershell
npm run build:windows
```

This produces `Windows/NetPlex-win32-x64/` and `Windows/Installers/NetPlex-Setup-<version>.exe`. Check that no packaged settings, credentials or test data are included. Verify the application launches, the bundled player is present, and a fresh profile starts at Plex login. Preserve existing login and design files when testing an upgrade. Run installation updates only when authorized and close only the specific NetPlex instance being updated.

Create a draft GitHub release for `v<version>`, attach the EXE, `SHA256.txt` and `LÆS MIG.txt`, verify uploaded sizes/hashes, then publish when the user has authorized publication. Never overwrite an already published installer or tag; use a new version instead. Keep repository visibility unchanged unless the user explicitly requests a visibility change. A private repository requires access for friends to download releases.

Keep release notes in `docs/releases/`. Update README features, download links and demo screenshots when relevant. GitHub displays root `README.md` on the repository landing page; this is documentation for the app, not a separate website. Keep the third-party license notices and pinned source references in `desktop/THIRD-PARTY.md` with distributed builds.
