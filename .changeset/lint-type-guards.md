---
'compute-scroll-into-view': patch
---

Check for `HTMLElement` and `ShadowRoot` properties with type guards instead of type assertions. The checks are the same, so behavior is unchanged. The type declarations now use the JSDoc `@default` tag instead of TSDoc's `@defaultValue`.
