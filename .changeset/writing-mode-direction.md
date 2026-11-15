---
'compute-scroll-into-view': minor
---

Follow the target's `writing-mode` and `direction`, like browsers do, and support negative scroll offsets.

- `block` and `inline` now refer to the target's block and inline axes. For example, `inline: 'start'` aligns to the right edge of a right-to-left target, and `block: 'start'` aligns to the right edge of a `vertical-rl` target. Horizontal left-to-right targets work as before.
- Scroll containers that overflow to the left or top, like right-to-left or `vertical-rl` ones, now get the negative `left` and `top` offsets browsers use for them, instead of being clamped to 0 (#821).
- Scrollbars on the left side of a scroll container are accounted for.
