---
'compute-scroll-into-view': minor
---

`compute` accepts a `Range` or `Selection` as its target, with `selection()` in `middleware`, and `selection()` defaults to it

The scroll containers of the element around the focus end of the selection are scrolled, and `selection()` aligns the focus end, where the caret is. `selection(undefined, { align: 'bounds' })` aligns the box around the whole selection. TypeScript only accepts a `Range` or `Selection` target when `middleware` includes `selection()`, which now returns a `SelectionMiddleware`. An element target is accepted with or without it. Middleware can read the target from the new `state.selection`:

```diff
-compute(range.startContainer.parentElement, {
+compute(range, {
   block: 'nearest',
   inline: 'nearest',
-  middleware: [selection(range)],
+  middleware: [selection()],
 })
```

`Options['middleware']` accepts a `readonly Middleware[]`.
