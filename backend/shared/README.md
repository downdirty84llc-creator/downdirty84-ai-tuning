# Troubleshooting catalog mirror

`troubleshooting.mjs` is an exact mirror of the established desktop/web catalog at `products/dd84-desktop/troubleshooting.mjs`. Keeping this dependency inside `backend/` makes the Render backend root self-contained. The root browser regression suite checks equality (normalizing line endings) before running; do not change one without the other. The TypeScript declaration here is also used by the web job attachment UI.

Update the mirror with `node scripts/sync-troubleshooting.mjs` from the repository root after a reviewed catalog change. No application code is fetched at runtime. Changing the mirror does not modify historical operator submissions. Future catalog versions need an explicit migration/reader strategy; do not silently reinterpret an unsupported case version.
