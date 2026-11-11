---
'compute-scroll-into-view': patch
---

Fix `scroll-margin` with `block: 'center'`, `inline: 'center'` and `'nearest'` alignment to match `Element.scrollIntoView()`. The target's scroll-margin box is now centered, and `'nearest'` takes the full scroll-margin box into account.
