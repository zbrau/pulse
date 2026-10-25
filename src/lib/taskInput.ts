import type { Priority, TaskDraft } from '../types'

export type ParsedTaskInput = Required<TaskDraft> & { title: string }

const PRIORITY_ALIASES: Record<string, Priority> = {
  '1': 'alta',
  a: 'alta',
  alta: 'alta',
  '2': 'media',
  m: 'media',
  media: 'media',
  '3': 'baja',
  b: 'baja',
  baja: 'baja',
}

const TAG_CHARS = /^[\p{L}\p{N}_-]{1,20}$/u
const TRAILING = /[.,;:!?]+$/

/**
 * Interpreta los atajos del input rápido:
 *   `!alta` / `!1`  prioridad     `#tag`  etiqueta     `*3`  estimación
 * Lo que no matchea se queda como parte del título.
 */
export const parseTaskInput = (raw: string): ParsedTaskInput => {
  const words = raw.split(/\s+/)
  const title: string[] = []
  const tags: string[] = []
  let priority: Priority = 'media'
  let estimate = 1

  for (const word of words) {
    if (!word) continue

    if (word.startsWith('!')) {
      const found = PRIORITY_ALIASES[word.slice(1).toLowerCase()]
      if (found) {
        priority = found
        continue
      }
    }

    if (word.startsWith('*')) {
      const n = Number(word.slice(1))
      if (Number.isInteger(n) && n >= 1 && n <= 12) {
        estimate = n
        continue
      }
    }

    if (word.startsWith('#')) {
      const clean = word.slice(1).replace(TRAILING, '')
      if (TAG_CHARS.test(clean)) {
        const tag = clean.toLowerCase()
        if (tags.length < 4 && !tags.includes(tag)) tags.push(tag)
        continue
      }
    }

    title.push(word)
  }

  return { title: title.join(' '), priority, estimate, tags }
}
