---
'compute-scroll-into-view': minor
---

Respect `scroll-padding` and align `scroll-margin` like browsers do.

- `scroll-padding` on scroll containers, and on the root element for the viewport, is now part of the alignment (#831). Padding in percentages is supported.
- `scroll-margin` of the target now works with `block: 'center'` and `'nearest'`, and together with `scroll-padding` (#933).
- `scrollMode: 'if-needed'` only counts a target as visible when its `scroll-margin` box is within the scroll containers' `scroll-padding` (#817). For example, a target behind a fixed header that is covered by `scroll-padding-top` is scrolled into view.
- `nearest` is measured from the padding edge of scroll containers with borders, instead of the border edge.
