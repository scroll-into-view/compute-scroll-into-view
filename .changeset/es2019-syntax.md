---
'compute-scroll-into-view': patch
---

Compile the published bundles to ES2019 syntax again. Releases 3.2.0 and 3.2.1 shipped optional chaining (`?.`) and nullish coalescing (`??`) because the browserslist targets drifted, which broke Webpack 4 and other older toolchains ([scroll-into-view-if-needed#1235](https://github.com/scroll-into-view/scroll-into-view-if-needed/issues/1235)). The build targets are now pinned and the build fails if the output isn't ES2019-compatible.
