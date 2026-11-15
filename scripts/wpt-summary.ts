// Prints how many of the vendored web-platform-tests pass, from integration/wpt/expectations.json
//
//   vpx scripts/wpt-summary.ts
import { readFileSync } from 'node:fs'

const read = (file: string) =>
  JSON.parse(
    readFileSync(new URL(`../integration/wpt/${file}`, import.meta.url), 'utf8')
  )
const manifest: { revision: string; skipped: Record<string, string> } =
  read('manifest.json')
const expectations: Record<
  string,
  { status: string; subtests: Record<string, string> }
> = read('expectations.json')

const totals: Record<string, number> = {}
const rows = Object.entries(expectations).map(
  ([path, { status, subtests }]) => {
    const statuses = Object.values(subtests)
    for (const subtest of statuses) totals[subtest] = (totals[subtest] ?? 0) + 1
    const passed = statuses.filter((subtest) => subtest === 'PASS').length
    return `${`${passed}/${statuses.length}`.padStart(7)}  ${status === 'OK' ? '' : `[${status}] `}${path}`
  }
)

console.log(rows.join('\n'))
const subtests = Object.values(totals).reduce((sum, count) => sum + count, 0)
console.log(
  `\nWPT ${manifest.revision}: ${totals.PASS ?? 0}/${subtests} subtests pass in ${rows.length} files (${Object.entries(
    totals
  )
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')}), ${Object.keys(manifest.skipped).length} files skipped`
)
