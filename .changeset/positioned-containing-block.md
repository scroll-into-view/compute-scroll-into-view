---
'compute-scroll-into-view': patch
---

author: @satouriko

Only scroll the scroll containers in the containing block chain of the target, like `Element.scrollIntoView()` does. Scroll containers that an absolutely or fixed positioned target escapes don't move it, so they aren't scrolled anymore, and the viewport isn't scrolled for a fixed positioned target either. Containing blocks follow `position` and the properties that contain positioned descendants, like `transform`, `filter` and `contain`. Middleware still visit those scroll containers, with `scrollable: false`.
