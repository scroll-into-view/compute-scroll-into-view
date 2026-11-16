---
'compute-scroll-into-view': major
---

`compute(target, options)` is spec-only. The `scrollMode`, `boundary` and `skipOverflowHiddenElements` options are removed, and are middleware instead, with the same behavior. The built-in middleware are exported from `compute-scroll-into-view/middleware`, so the main entry only has `compute` and its types. Middleware can also change how scroll containers are found and measured, like `scroll-margin` and `scroll-padding`. `options` is now optional.

```js
import { compute } from 'compute-scroll-into-view'
import {
  boundary,
  onlyIfNeeded,
  skipOverflowHiddenElements,
} from 'compute-scroll-into-view/middleware'

// Before: compute(node, { scrollMode: 'if-needed', boundary: list, skipOverflowHiddenElements: true })
compute(node, {
  middleware: [boundary(list), skipOverflowHiddenElements(), onlyIfNeeded()],
})
```

- Put `onlyIfNeeded()` after the other middleware, which is how the options combined.
- The `ScrollMode` type is removed. `ComputeOptions` is an alias of `Options`, and the `Middleware`, `MiddlewareState`, `MiddlewareReturn`, `Rects` and `SideObject` types are exported from `compute-scroll-into-view`.
