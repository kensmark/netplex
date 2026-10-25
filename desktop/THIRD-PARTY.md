# Tredjepartskomponenter

NetPlex Desktop bruger Electron 45.0.0, Chromium og Node.js. Electron- og Chromium-licenser følger programmet som LICENSE og LICENSES.chromium.html.

Designstudio og layoutmotoren bruger React og React DOM 19.3.1 under MIT-licensen. Den genererede designvalidator bruger Ajv 8.20.0 under MIT-licensen. Licensmeddelelser følger de byggede JavaScript-filer i public/design; public/design/THIRD-PARTY.txt indeholder de fulde licenstekster. TypeScript, esbuild, Prettier og Playwright bruges kun under udvikling og bygning.

Den native Windows-videoflade bruger Koffi 3.3.4 til User32-funktioner. Koffi er MIT-licenseret; licensen ligger sammen med modulet i node_modules/koffi/LICENSE.txt i applikationspakken. Kildekode og dokumentation: https://github.com/Koromix/koffi og https://koffi.dev/.

Videoafspilleren er mpv v0.41.0-1227-ge471496c5 fra Windows-builden 20261021 af shinchiro. Bygningen henvises til fra https://mpv.io/installation/ og hentes uændret med SHA-256-kontrol. Den oprindelige distributions indhold følger med i resources/mpv, inklusive dens manual og licensoplysninger. mpv og de tilknyttede FFmpeg-biblioteker anvender GPL/LGPL-licenser; se distributionens copyright- og licensfiler for de konkrete komponenter.

Build, kildekodereferencer og byggeopskrift: https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20261021 og https://github.com/shinchiro/mpv-winbuild-cmake. mpv-kildekode: https://github.com/mpv-player/mpv/tree/e471496c56. FFmpeg-kildekode: https://github.com/FFmpeg/FFmpeg/tree/9a861e968. Spilleren er en separat proces og kommunikerer med NetPlex gennem mpv's dokumenterede JSON IPC.

HLS.js bruges kun af den bevarede browserafspiller og er distribueret under Apache-2.0, med licens i node_modules/hls.js/LICENSE. Unbounded-skrifttypens SIL Open Font License ligger i public/assets/FONT-LICENSE.txt. Det originale NetPlex-demobillede er beskrevet i projektets ASSETS.md.
