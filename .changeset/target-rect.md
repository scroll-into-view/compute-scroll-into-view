---
'compute-scroll-into-view': minor
---

Add the `targetRect()` middleware. It aligns a rectangle, such as a text range's `getBoundingClientRect()`, instead of the target element's border box. The ancestor walk is still that element's, so pass a node inside the scroll container that should scroll. `onlyIfNeeded()` sees the rectangle when it runs after `targetRect()`.
