/**
 * Vite copies everything in public/ into dist/, which pulls the ~21,700 media
 * files and the json chunks into the deployment. Those are served from R2 by
 * functions/media/, and leaving them in dist/ would exceed Cloudflare Pages'
 * 20,000 file limit and upload a gigabyte on every deploy.
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const PRUNE = ['dist/media', 'dist/json']
const LIMIT = 20000 // Pages free plan, per deployment

const countFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).reduce(
        (n, e) => n + (e.isDirectory() ? countFiles(resolve(dir, e.name)) : 1),
        0,
      )
    : 0

if (!existsSync('dist')) {
  console.error('dist/ not found - run `pnpm build` first')
  process.exit(1)
}

const before = countFiles('dist')
for (const dir of PRUNE) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`removed ${dir} (served from R2)`)
  }
}
const after = countFiles('dist')

console.log(`dist: ${before} -> ${after} files`)
if (after > LIMIT) {
  console.error(`still over the Cloudflare Pages limit of ${LIMIT} files`)
  process.exit(1)
}
