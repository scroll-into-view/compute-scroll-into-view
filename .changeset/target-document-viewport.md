---
'compute-scroll-into-view': patch
---

Use the target's own document and window for viewport measurements, so scrolling a target inside a frame works when `compute` is called from the parent document.
