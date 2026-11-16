---
'compute-scroll-into-view': patch
---

author: @satouriko

Don't scroll ancestors that don't move a positioned target. An absolutely positioned target and its absolutely positioned ancestors are followed to their offset parent, so the scroll containers in between aren't scrolled. A fixed positioned target only scrolls the viewport.
