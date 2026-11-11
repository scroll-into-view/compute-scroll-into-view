# CSSOM scrolling update — 11 November 2026

## What the current standards say

| API                                      | Current contract                                                                                                                                                                                                                        | Consequence for these packages                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Element.scroll`, `scrollTo`, `scrollBy` | CSSOM View specifies `Promise<ScrollResult>`, with `{ interrupted: boolean }`; interruption resolves rather than rejects. `auto` consults CSS `scroll-behavior`; `instant` bypasses it.                                                 | Preserve native completion promises when applying actions. Do not assume every browser returns one.                                           |
| `Element.scrollIntoView`                 | Defaults are `block: 'start'`, `inline: 'nearest'`, `container: 'all'`, `behavior: 'auto'`. `container: 'nearest'` stops after the first ancestor scrolling box. It also specifies `Promise<ScrollResult>` aggregated across scrollers. | Normalize all option dictionaries consistently, support container selection, and combine native results.                                      |
| `HTMLElement.focus`                      | Defined in HTML, returns `undefined`; supports `preventScroll` and `focusVisible`. Without `preventScroll`, HTML invokes scroll-into-view with auto/center/center.                                                                      | Keep focus management native. To control its scrolling, call `focus({ preventScroll: true })`, then the ponyfill.                             |
| `scrollIntoViewIfNeeded` replacement     | CSSWG PR #5677 remains **open and unmerged**. Its current text proposes a member named `scroll`, plus `FocusScrollOptions`, with visibility/default details still unresolved.                                                           | `scrollMode: 'if-needed'` remains a library extension. Neither that spelling nor proposed focus scroll options are a shipped standard API.    |
| CSS `scroll-margin` and `scroll-padding` | CSS Scroll Snap defines their effect on scroll-into-view even without scroll snapping. Margin expands the target; padding insets each scrollport. Root padding comes from the root element, not propagated body padding.                | Apply each once, include both in alignment/visibility, resolve percentages against the scrollport, and account for scrollbar/border geometry. |

Sources: [CSSOM View source](https://github.com/w3c/csswg-drafts/blob/cb8227b68d1b67b905744e24c31d6633de52511a/cssom-view-1/Overview.bs), [HTML focus](https://html.spec.whatwg.org/multipage/interaction.html#dom-focus), [CSS Scroll Snap](https://drafts.csswg.org/css-scroll-snap-1/#scroll-padding), [replacement proposal](https://github.com/w3c/csswg-drafts/pull/5677), [scroll promises resolution](https://github.com/w3c/csswg-drafts/issues/1562).

## Spec text versus browser behavior

The current CSSOM algorithm describes alignment using each scrolling box's writing mode. Engines instead use the **target's** writing mode consistently through its ancestors; [CSSWG #11796](https://github.com/w3c/csswg-drafts/issues/11796) tracks this discrepancy. This update follows interoperable engine behavior for alignment and uses each scroller's own writing mode to determine positive/negative scroll coordinate bounds.

MDN compatibility data checked on this date lists native scroll promises in Chrome 150+, and `container` in Chrome 140+, with Firefox/Safari entries still false for those individual features. See [Element compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json). This is a dated snapshot, not a promise of uniform browser support. Test the actual return value instead of browser version detection.

## Implementation and compatibility

- The engine computes margin-expanded target rectangles in each scroller’s coordinate space and padding-inset scrollports, including percentages, `calc()`, `min()`, `max()`, and `clamp()`. It respects logical directions, negative scroll offsets, scaled nested scrollers, slots, and the target's owning document.
- `container: 'nearest'` also stops at scroll containers with no current overflow. The existing `boundary` remains an additional library constraint, with its inclusive boundary behavior preserved.
- `if-needed` checks the expanded target against each ancestor's optimal viewing region independently. A visible inner scroller no longer prevents necessary outer scrolling. The proposal leaves visibility undefined; padding-aware visibility here is a documented library policy.
- The low-level engine retains its historical default `block: 'center'`. The public ponyfill supplies the native `start` default, even for `{ behavior: 'smooth' }`, `{ container: 'nearest' }`, and custom behaviors. Consumers relying on the previous inconsistent center default should pass `block: 'center'` explicitly.
- The standard ponyfill returns `Promise<ScrollResult>` when all native scroll calls return promises, or `undefined` when any call uses a legacy void-returning implementation. No-op calls resolve `{ interrupted: false }`. It does not fabricate an early smooth-scroll completion promise or install global patches.
- Custom behavior return values pass through unchanged, including on disconnected or boxless targets, where the callback receives an empty action list. The smooth add-on resolves its own animations to the existing action array; this is intentionally distinct from native `ScrollResult`.

## Testing and release order

The engine now runs 18 pinned upstream WPT fixtures in its existing browser CI, plus native comparison matrices for combined margins/padding, CSS math, writing modes/direction, and scaled nested scrollers. The WPT pin and refresh script make the selection reproducible. The ponyfill's automated tests cover option normalization, applying computed coordinates once, completion across multiple native promises, interruption, legacy return behavior, custom callbacks, and no-op targets; its test job is enabled again. TypeScript examples cover current options and return types. The smooth add-on has regressions for zero-duration/no-op completion and custom return values.

Publish the engine changes first, then the standard ponyfill, then the smooth add-on, and finally update the site. These are separate repositories: downstream lockfiles still resolve published versions until the corresponding upstream release exists. Cross-repository integration must also be checked with the locally updated packages linked together; testing only registry dependencies does not validate the new engine behavior through the wrappers.

## Verification results

- Node 26 typechecks and production builds cover all three packages and the documentation site.
- Engine integration: 101 passing tests, including 18 pinned WPT fixtures and native comparison matrices.
- Calling layer: 14 unit tests; browser coverage includes native completion, interruption, one-time margin application, and focus with preventScroll. A coordinated run with all three local packages linked also checks container selection and combined spacing. The three upstream promise fixtures contribute 14 scrollIntoView assertions, all passing on Chrome 156. Chrome 143 exercises the legacy path and explicitly skips native-promise assertions.
- Smooth add-on: 12 tests covering completion, no-op, custom return values, zero duration, container forwarding, and custom easing regressions.
- WPT diagnostic: Chrome 156 fails the unmodified native-only `Element.scrollBy promise after iframe removal` assertion. The test adapter only replaces scrollIntoView. This native browser failure is reported separately and is not described as ponyfill conformance.
- Documentation page: production build and desktop/mobile browser inspection. Existing source hints and a large-chunk build warning remain.

## Boundaries of this update

This is a ponyfill update, not a complete user-agent implementation. Cross-document propagation through outer iframe ancestors, coordinated visual/layout viewport scrolling under pinch zoom, fixed-position containing-block traversal, and browser scroll-snap target selection still have limits. The engine reads the owning document and supports its scrollers, but does not walk into outer frame documents. Snap selection and UA-specific focus/visibility policies remain native responsibilities. Geometry tests do not establish full cross-browser WPT conformance; native promise support is verified separately on a supporting browser.
