// Exposes the `page` global that the tests use. It forwards to the commands in
// ./fixture-commands.ts, which drive the fixture in a separate top-level page.
import { afterAll } from 'vite-plus/test'
import { commands } from 'vite-plus/test/browser'

globalThis.page = {
  goto: (path) => commands.gotoFixture(path),
  evaluate: (fn, ...args) => commands.evaluateInFixture(fn.toString(), args),
}

afterAll(() => commands.closeFixture())
