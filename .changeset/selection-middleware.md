---
'compute-scroll-into-view': minor
---

Add the `selection()` middleware, which scrolls a text selection into view instead of the target element, like editors keep the caret in view ([#902](https://github.com/scroll-into-view/compute-scroll-into-view/issues/902)). It takes a `Selection` or a `Range`, and defaults to the document's selection. The focus end is aligned, where the caret is: a collapsed caret is measured as the character or node next to it, so empty lines work too. `align: 'bounds'` aligns the whole selection instead. `compute` still walks the target's ancestors, so pass an element inside the editor. `onlyIfNeeded()` checks the selection when it runs after `selection()`.
