---
'compute-scroll-into-view': patch
---

Declare the supported browsers as [Baseline 2019](https://web.dev/baseline) in the `browserslist` field of `package.json`, and build for it. The bundle now also compiles away optional catch binding for legacy Edge 18, and stays free of optional chaining and nullish coalescing. `dist/index.d.ts.map` is no longer published, as it pointed at `src/`, which isn't published either. `dist/index.js.map` still embeds the source.
