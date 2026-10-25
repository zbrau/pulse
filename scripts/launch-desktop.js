import { exec } from 'child_process'
import path from 'path'
import os from 'os'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const userDataDir = path.join(os.homedir(), 'AppData', 'Local', 'PulseMusic')

const url = 'http://localhost:5173'
const cmd = `"${chromePath}" --app=${url} --window-size=1280,820 --user-data-dir="${userDataDir}"`

console.log('Iniciando ventana de escritorio Pulse...')
exec(cmd, (err) => {
  if (err) console.error('Error abriendo ventana:', err)
})
