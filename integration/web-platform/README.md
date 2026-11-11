# CSSOM View web platform tests

Unmodified upstream fixtures and harness from [web-platform-tests/wpt](https://github.com/web-platform-tests/wpt), pinned in `manifest.json`. Their BSD license is included in `LICENSE.md`.

Run `pnpm build && pnpm test` from the repository root. `../web-platform.test.js` injects the built engine before scripts run in every frame, substitutes `Element.scrollIntoView` with an adapter that applies computed actions, and collects real testharness results. No upstream expected results are changed. The slot fixture is a reftest; its scroll offset is checked explicitly rather than treating it as a testharness test.

The selected cases cover scroll margin/padding, container selection (including a child frame), all writing modes, RTL, nearest alignment for visible/oversized targets, borders, SVG, and shadow/slot traversal. The engine adapter uses instant scrolling: these fixtures check geometry, not native animation or promise timing. Native promise tests belong to the calling layer.

Refresh this selection with `node scripts/update-web-platform.mjs <upstream-commit-sha>`, review upstream changes, and rerun the suite. The default revision is the existing pin. To expand coverage, add filenames to the manifest before running the script. This is a curated subset, not the complete WPT suite.

For a locally installed browser, set `PUPPETEER_EXECUTABLE_PATH`. Root/container environments that need it can opt in to `PUPPETEER_NO_SANDBOX=1`.
