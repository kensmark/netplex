// Compatibility entry point: the Studio now targets the Windows application.
import '../desktop/scripts/studio-check.mjs';
await import('../desktop/scripts/customization-check.mjs');
await import('../desktop/scripts/multi-server-check.mjs');
await import('../desktop/scripts/search-check.mjs');
await import('../desktop/scripts/studio-modules-check.mjs');
