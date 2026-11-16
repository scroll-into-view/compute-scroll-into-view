---
'compute-scroll-into-view': minor
---

Scroll the scroll containers and the viewport of the parent document too, when the target is in a same-origin iframe, as `Element.scrollIntoView()` and the CSSOM View spec do. They align the `<iframe>` where the scrolling inside the frame left the target, up to the top-level document. Cross-origin parents aren't reachable, and aren't scrolled. A `position: fixed` target in a frame doesn't move with the frame's viewport, so only the parent document is scrolled for it. This also covers scrolling a frame's target from inside the frame (#694).
