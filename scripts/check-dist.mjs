/**
 * Guards the Cloudflare Pages file limit before a deploy.
 *
 * Posters are packed into sheets (9x6) rather than one file per title
 * precisely so the whole site fits: 21,472 individual posters would be over
 * the limit on their own.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const LIMIT = 20000 // Cloudflare Pages, free plan, per deployment

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce(
    (acc, entry) => {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        const child = walk(path)
        return { files: acc.files + child.files, bytes: acc.bytes + child.bytes }
      }
      return { files: acc.files + 1, bytes: acc.bytes + statSync(path).size }
    },
    { files: 0, bytes: 0 },
  )

if (!existsSync('dist')) {
  console.error('dist/ not found - run `pnpm build` first')
  process.exit(1)
}

const { files, bytes } = walk('dist')
console.log(`dist: ${files} files, ${(bytes / 1048576).toFixed(0)} MB`)

if (files > LIMIT) {
  console.error(`over the Cloudflare Pages limit of ${LIMIT} files by ${files - LIMIT}`)
  process.exit(1)
}
console.log(`within the ${LIMIT} file limit`)
