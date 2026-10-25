// Genera latest.json para el auto-updater a partir de los artefactos que deja
// `tauri build` en bundle/nsis. Se usa para publicaciones manuales; en CI lo
// hace tauri-action.
//
//   node scripts/latest-json.mjs [--tag v0.2.0] [--repo zbrau/pulse]
//
// Salida: latest.json en la carpeta del bundle.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(
  readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
)
const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const version = config.version
const tag = flag('tag', `v${version}`)
const repo = flag('repo', 'zbrau/pulse')

if (!existsSync(bundleDir)) {
  console.error(`No existe ${bundleDir}. Ejecuta antes: npm run tauri:build`)
  process.exit(1)
}

const files = readdirSync(bundleDir)
const setups = files.filter((name) => name.endsWith('-setup.exe'))
const setup =
  setups.find((name) => name.includes(`_${version}_`)) ?? setups[0]

// Tauri v2 firma el instalador NSIS como artefacto del updater. Con
// `createUpdaterArtifacts: "v1Compatible"` aparece además un .nsis.zip.
const zip =
  files.find((name) => name.endsWith('.nsis.zip') && name.includes(version)) ??
  files.find((name) => name.endsWith('.nsis.zip'))
const artifact = zip ?? setup
const signatureName = artifact ? `${artifact}.sig` : undefined

if (!artifact || !signatureName || !existsSync(join(bundleDir, signatureName))) {
  console.error(
    'Faltan los artefactos del updater (.exe.sig o .nsis.zip.sig). ' +
      'Comprueba createUpdaterArtifacts y las variables TAURI_SIGNING_PRIVATE_KEY*.',
  )
  process.exit(1)
}

const signature = readFileSync(join(bundleDir, signatureName), 'utf8').trim()

const manifest = {
  version,
  notes: `Pulse ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repo}/releases/download/${tag}/${artifact}`,
    },
  },
}

const out = join(bundleDir, 'latest.json')
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

const sha = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()

console.log(`latest.json -> ${out}`)
console.log(`version      ${version}`)
console.log(`artifact     ${artifact}`)
if (setup) {
  console.log(`installer    ${setup} (${statSync(join(bundleDir, setup)).size} bytes)`)
  console.log(`sha256       ${sha(join(bundleDir, setup))}`)
}
