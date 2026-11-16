---
'compute-scroll-into-view': patch
---

Scroll the viewport when the target is the scrolling element, or the root element in quirks mode. They have no ancestor that scrolls the viewport, so `compute(document.body)` returned no actions in quirks mode, and `compute(document.documentElement)` didn't in standards mode.
