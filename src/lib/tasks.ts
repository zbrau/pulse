import type { Priority, Task } from '../types'

/** De mayor a menor urgencia: define el orden de la lista. */
export const PRIORITY_ORDER: Priority[] = ['alta', 'media', 'baja']

export const PRIORITY_LABEL: Record<Priority, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  alta: 'var(--color-warn)',
  media: 'var(--color-accent)',
  baja: 'var(--color-muted)',
}

const RANK: Record<Priority, number> = { alta: 0, media: 1, baja: 2 }

/** Las tareas viejas (sin prioridad) se tratan como media. */
const rankOf = (priority: Priority | undefined): number =>
  RANK[priority ?? 'media'] ?? 1

/**
 * Pendientes ordenadas por prioridad. El sort es estable, así que dentro de
 * cada grupo se respeta el orden manual del array de tareas.
 */
export const sortPending = (tasks: Task[]): Task[] =>
  tasks
    .filter((t) => !t.done)
    .sort((a, b) => rankOf(a.priority) - rankOf(b.priority))

/**
 * Mueve `id` justo antes/después de `targetId` en el array de tareas.
 * Si se pasa `priority`, la tarea adopta esa prioridad: soltar una tarea en
 * otro grupo la reclasifica, que es lo que el usuario ve al soltarla ahí.
 */
export const moveTaskWithin = (
  tasks: Task[],
  id: string,
  targetId: string,
  place: 'before' | 'after',
  priority?: Priority,
): Task[] => {
  if (id === targetId) return tasks
  const dragged = tasks.find((t) => t.id === id)
  if (!dragged) return tasks

  const rest = tasks.filter((t) => t.id !== id)
  const index = rest.findIndex((t) => t.id === targetId)
  if (index < 0) return tasks

  const next = [...rest]
  next.splice(place === 'before' ? index : index + 1, 0, {
    ...dragged,
    priority: priority ?? dragged.priority,
  })
  return next
}
