---
'compute-scroll-into-view': minor
---

Land on the target's own snap position in its nearest scroll container when that's a scroll snap container, as the CSSOM View spec requires. On each axis that the container's `scroll-snap-type` snaps, the target's `scroll-snap-align` replaces `block` or `inline` there. The outer scroll containers now align the target from where the browser actually snaps the inner one.
