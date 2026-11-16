---
'compute-scroll-into-view': patch
---

author: @feritcemkahraman

Don't scroll `overflow: visible` elements inside an iframe. Only the iframe document's viewport (its root or scrolling element) is clipped by the iframe and scrolled when its content overflows it.
