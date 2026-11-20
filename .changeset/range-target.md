---
'compute-scroll-into-view': minor
---

`compute` accepts a `Range` or `Selection` as its target, and `selection()` defaults to it

The box around the selected text is aligned, in the scroll containers of the element around its focus end. Add `selection()` without an argument to align the focus end instead, and middleware can read the target from the new `state.selection`:

```diff
-compute(range.startContainer.parentElement, {
+compute(range, {
   block: 'nearest',
   inline: 'nearest',
-  middleware: [selection(range)],
+  middleware: [selection()],
 })
```
