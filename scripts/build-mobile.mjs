import { cp, mkdir, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

await rm('mobile-dist', { recursive: true, force: true })
await mkdir('mobile-dist', { recursive: true })
await exec(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.mobile.json'])
for (const file of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icon.svg']) {
  await cp(`mobile/${file}`, `mobile-dist/${file}`)
}
