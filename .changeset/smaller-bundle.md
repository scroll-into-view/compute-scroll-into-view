---
'compute-scroll-into-view': patch
---

Shrink the published bundle by about a fifth when minified. Measuring the four sides of a box and scrolling each axis now share one code path, and `getPropertyValue()` replaces the per-side style lookups. Behavior is unchanged.
