---
'compute-scroll-into-view': minor
---

Add the `container` option from the CSSOM View spec's `ScrollIntoViewOptions`. `container: 'nearest'` only scrolls the target's nearest scroll container, or the viewport if it has none. The default, `'all'`, scrolls every scroll container as before.
