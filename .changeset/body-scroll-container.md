---
'compute-scroll-into-view': patch
---

Scroll the body when it's a scroll container. Its overflow only applies to the viewport when the root's overflow is `visible`, so a body with `overflow: auto` under a root with `overflow: hidden`, `auto` or `clip` is scrolled now, like `Element.scrollIntoView()` does.
