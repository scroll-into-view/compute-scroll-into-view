---
'compute-scroll-into-view': patch
---

author: @Remiscan

Scroll the scroll containers in a shadow tree that a slotted target is laid out in. The parent walk now goes from an element to its `assignedSlot`, before its parent element, so the slot's ancestors in the shadow tree are scrolled too, like `Element.scrollIntoView()` does.
