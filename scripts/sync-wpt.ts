// Vendors the web-platform-tests that exercise scrollIntoView into integration/wpt/upstream, at the revision pinned in
// integration/wpt/wpt.config.json. See integration/wpt/README.md.
//
//   vpx scripts/sync-wpt.ts                     re-sync the pinned revision
//   vpx scripts/sync-wpt.ts --revision <sha>    pin another revision, then sync it
//   vpx scripts/sync-wpt.ts --latest            pin the tip of the upstream default branch, then sync it
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Config {
  repository: string
  revision: string
  include: string[]
  exclude: Record<string, string>
}

interface Manifest {
  repository: string
  revision: string
  tests: string[]
  skipped: Record<string, string>
  files: string[]
}

const wptDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../integration/wpt'
)
const upstreamDir = join(wptDir, 'upstream')
const configPath = join(wptDir, 'wpt.config.json')
const manifestPath = join(wptDir, 'manifest.json')

const config: Config = JSON.parse(readFileSync(configPath, 'utf8'))

const flag = (name: string) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : (process.argv[index + 1] ?? '')
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 })

if (process.argv.includes('--latest')) {
  config.revision = git(wptDir, 'ls-remote', config.repository, 'HEAD').split(
    '\t'
  )[0]
} else if (flag('--revision')) {
  config.revision = flag('--revision')!
}
if (!/^[0-9a-f]{40}$/.test(config.revision)) {
  throw new Error(`Pin a full commit SHA, got "${config.revision}"`)
}

// Lists every file at the revision without downloading their contents
const clone = mkdtempSync(join(tmpdir(), 'wpt-'))
let tree: Set<string>
try {
  git(clone, 'init', '--quiet')
  git(
    clone,
    'fetch',
    '--quiet',
    '--depth=1',
    '--filter=blob:none',
    config.repository,
    config.revision
  )
  tree = new Set(
    git(clone, 'ls-tree', '-r', '--name-only', 'FETCH_HEAD').split('\n')
  )
} finally {
  rmSync(clone, { recursive: true, force: true })
}

// `*` matches within a path segment, `**` across segments. Case-insensitive, as WPT spells scrollIntoView both ways
const toRegExp = (glob: string) =>
  new RegExp(
    '^' +
      glob
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\0')
        .replace(/\*/g, '[^/]*')
        .replace(/\0/g, '.*') +
      '$',
    'i'
  )
const include = config.include.map(toRegExp)
// Reference files, helpers and resources are pulled in as dependencies of the tests that use them
const isSupportFile = (path: string) =>
  /(^|\/)(support|resources|reference|crashtests)\//.test(path) ||
  /-ref\.html?$|-notref\.html?$/.test(path)

const candidates = [...tree]
  .filter((path) => include.some((pattern) => pattern.test(path)))
  .filter((path) => !isSupportFile(path))
  .toSorted()

const repositoryPath = new URL(config.repository).pathname.replace(/\.git$/, '')
async function fetchWithRetry(url: string, attempt = 1): Promise<Buffer> {
  const response = await fetch(url)
  if (response.ok) return Buffer.from(await response.arrayBuffer())
  if (attempt === 4 || response.status === 404) {
    throw new Error(`${url}: HTTP ${response.status}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
  return fetchWithRetry(url, attempt + 1)
}
const downloads = new Map<string, Promise<Buffer>>()
function download(path: string): Promise<Buffer> {
  let body = downloads.get(path)
  if (!body) {
    body = fetchWithRetry(
      `https://raw.githubusercontent.com${repositoryPath}/${config.revision}/${path}`
    )
    downloads.set(path, body)
  }
  return body
}

const textFile = /\.(html?|xht(ml)?|svg|js|css|json|headers)$/i
// Root-relative and relative URLs in markup, scripts and stylesheets. Anything that doesn't resolve to a file in the
// tree (anchors, external links, template strings, ...) is ignored
const references = (path: string, source: string) => {
  const found = new Set<string>()
  const patterns = [
    /(?:src|href|data)\s*=\s*["']([^"'#?]+)/g,
    /url\(\s*["']?([^"')#?]+)/g,
    /["'`]([^"'`\s#?()]+\.(?:js|html?|xht(?:ml)?|css|svg|png|jpe?g|gif|webp|json))["'`]/gi,
  ]
  for (const pattern of patterns) {
    for (const [, url] of source.matchAll(pattern)) {
      if (/^(?:[a-z]+:|\/\/)/i.test(url)) continue
      const resolved = url.startsWith('/')
        ? url.slice(1)
        : posix.join(posix.dirname(path), url)
      if (tree.has(resolved) && resolved !== path) found.add(resolved)
    }
  }
  return found
}

const manifest: Manifest = {
  repository: config.repository,
  revision: config.revision,
  tests: [],
  skipped: {},
  files: [],
}

// A test is relevant when its name, its source, or a file it loads mentions scrollIntoView, as some call it through a
// helper script or a child frame
const mentionsScrollIntoView = /scroll-?into-?view/i
const sources = await Promise.all(
  candidates.map(async (path) => {
    const source = (await download(path)).toString()
    const loaded = await Promise.all(
      [...references(path, source)]
        .filter((dependency) => textFile.test(dependency))
        .map(async (dependency) => (await download(dependency)).toString())
    )
    const relevant = [path, source, ...loaded].some((text) =>
      mentionsScrollIntoView.test(text)
    )
    return [path, source, relevant] as const
  })
)
for (const [path, source, relevant] of sources) {
  if (!relevant) continue
  if (config.exclude[path]) {
    manifest.skipped[path] = config.exclude[path]
  } else if (!source.includes('/resources/testharness.js')) {
    manifest.skipped[path] = /rel=["']?match/.test(source)
      ? 'reftest'
      : 'crashtest'
  } else if (source.includes('/resources/testdriver')) {
    manifest.skipped[path] =
      'needs testdriver (WebDriver input), which the harness does not provide'
  } else {
    manifest.tests.push(path)
  }
}

// The tests, everything they load, and the license
const files = new Set(['LICENSE.md', ...manifest.tests])
async function addDependencies(path: string): Promise<void> {
  if (!textFile.test(path)) return
  const added = [...references(path, (await download(path)).toString())]
    .filter((dependency) => !files.has(dependency))
    .map((dependency) => {
      files.add(dependency)
      return addDependencies(dependency)
    })
  await Promise.all(added)
}
await Promise.all(manifest.tests.map(addDependencies))
manifest.files = [...files].toSorted()

rmSync(upstreamDir, { recursive: true, force: true })
await Promise.all(
  manifest.files.map(async (path) => {
    const destination = join(upstreamDir, path)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, await download(path))
  })
)
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

console.log(
  `Synced ${manifest.tests.length} tests (${manifest.files.length} files) at ${config.revision}, skipped ${Object.keys(manifest.skipped).length}`
)
