# web-platform-tests

The [web-platform-tests](https://github.com/web-platform-tests/wpt) (WPT) that exercise `Element.scrollIntoView()`, run against `compute`. They measure how closely `compute` follows the [CSSOM View spec](https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view), including `scroll-margin`, `scroll-padding` and the `container` option.

| File                | What it is                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `wpt.config.json`   | The pinned WPT `revision`, and the `include` globs (and `exclude` reasons) that select the tests. Edit this one by hand        |
| `manifest.json`     | Generated: the selected tests, the skipped ones with why, and every vendored file                                              |
| `upstream/`         | Generated: unmodified copies of the tests and everything they load, at their WPT paths, with WPT's BSD license in `LICENSE.md` |
| `expectations.json` | The status every test file and subtest is expected to report, failures included                                                |

## Running

`vp test` runs them in Chromium together with the other integration tests, or on their own with `vp test integration/wpt.test.js`.

For each test in the manifest, `runWebPlatformTest` in [`../wpt-commands.ts`](../wpt-commands.ts) opens a page on `http://web-platform.test/` and answers every request from `upstream/`. Before any page script runs, in every frame, it installs `compute` (bundled from `src/index.ts`, so the tests count towards coverage) as `Element.prototype.scrollIntoView`. The replacement only does what the spec's `scrollIntoView()` method steps do around "scroll a target into view": it applies the argument defaults (`block: 'start'`, `inline: 'nearest'`, `false` for `block: 'end'`), does nothing for elements without a box, passes the other options (such as `container`) through, and applies the computed positions with the requested `behavior`, returning a promise of a `ScrollResult`. Everything else is up to `compute`.

The page is opened in a Chromium of its own, with the classic scrollbars that WPT's reference browsers have. Playwright's headless Chromium hides them, which some tests' pixel offsets depend on (`scrollIntoView-fixed.html` expects an iframe 15px narrower), while the other integration tests rely on that.

testharness.js reports the results, which have to match `expectations.json` exactly. A test file without an entry is expected to pass completely.

## Updating the expectations

When a change makes tests pass (or fail), the run fails until the expectations record it:

```sh
WPT_UPDATE_EXPECTATIONS=1 vp test integration/wpt.test.js
```

Review the diff of `expectations.json`: it's the conformance progress of the change. `vpx scripts/wpt-summary.ts` prints the pass counts per file and in total.

## Syncing with upstream

```sh
vpx scripts/sync-wpt.ts                    # re-sync the pinned revision
vpx scripts/sync-wpt.ts --latest           # pin the tip of WPT's default branch
vpx scripts/sync-wpt.ts --revision <sha>   # pin a specific commit
```

The script lists the files at the revision with a shallow, blobless `git fetch`, and downloads the ones it needs from `raw.githubusercontent.com`. It selects the HTML files that match `include` and mention scrollIntoView in their name, their source or a file they load, then follows their `src`/`href`/`url()` and quoted-path references to vendor what they load. Tests that can't run here are listed under `skipped` in the manifest instead: reftests and crashtests (no testharness.js), and tests that need testdriver.js, which requires WebDriver. To skip another test, add it to `exclude` with the reason.

After syncing, update the expectations and review both diffs.
