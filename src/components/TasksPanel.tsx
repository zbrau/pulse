import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  EllipsisVertical,
  ListTodo,
  Minus,
  Plus,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { Priority, Task } from '../types'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  sortPending,
} from '../lib/tasks'
import { parseTaskInput } from '../lib/taskInput'

const LABEL = 'text-[9.5px] font-medium tracking-[0.14em] text-faint uppercase'

type DropPlace = 'before' | 'after'

type RowHandlers = {
  openId: string | null
  draggingId: string | null
  drop: { id: string; place: DropPlace } | null
  tagFilter: string | null
  onToggleEditor: (id: string) => void
  onTag: (tag: string) => void
  onDragStart: (e: DragEvent<HTMLLIElement>, id: string) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent<HTMLLIElement>, id: string) => void
  onDrop: (e: DragEvent<HTMLLIElement>, id: string) => void
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const renameTask = useStore((s) => s.renameTask)
  const setEstimate = useStore((s) => s.setEstimate)
  const setPriority = useStore((s) => s.setPriority)
  const duplicateTask = useStore((s) => s.duplicateTask)
  const removeTask = useStore((s) => s.removeTask)
  const moveTaskBy = useStore((s) => s.moveTaskBy)

  const [name, setName] = useState(task.title)
  const cancelled = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const commit = () => {
    if (!cancelled.current) renameTask(task.id, name)
  }

  return (
    <div className="space-y-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          commit()
          onClose()
        }}
      >
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelled.current = true
              onClose()
            }
          }}
          maxLength={140}
          aria-label="Nombre de la tarea"
          className="input px-2.5 py-1.5 text-[12.5px]"
        />
      </form>

      <div>
        <p className={LABEL}>Prioridad</p>
        <div role="group" aria-label="Prioridad" className="mt-1 grid grid-cols-3 gap-1">
          {PRIORITY_ORDER.map((p: Priority) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(task.id, p)}
              aria-pressed={(task.priority ?? 'media') === p}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-1 py-1 text-[11px] transition ${
                (task.priority ?? 'media') === p
                  ? 'border-accent/35 bg-accent/10 text-fg'
                  : 'border-line bg-surface-2/60 text-faint hover:text-muted'
              }`}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: PRIORITY_COLOR[p] }}
              />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className={LABEL}>Estimación</p>
          <p className="mt-0.5 text-[10.5px] text-faint tnum">
            {task.pomodoros} completado{task.pomodoros === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setEstimate(task.id, task.estimate - 1)}
            disabled={task.estimate <= 1}
            aria-label="Reducir estimación"
            className="icon-btn size-6"
          >
            <Minus size={11} />
          </button>
          <span className="w-7 text-center text-[12px] text-fg tnum" aria-live="polite">
            {task.estimate}
          </span>
          <button
            type="button"
            onClick={() => setEstimate(task.id, task.estimate + 1)}
            disabled={task.estimate >= 12}
            aria-label="Aumentar estimación"
            className="icon-btn size-6"
          >
            <Plus size={11} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => moveTaskBy(task.id, -1)}
            disabled={task.done}
            aria-label="Subir tarea"
            title="Subir"
            className="icon-btn size-7"
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            onClick={() => moveTaskBy(task.id, 1)}
            disabled={task.done}
            aria-label="Bajar tarea"
            title="Bajar"
            className="icon-btn size-7"
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            onClick={() => duplicateTask(task.id)}
            aria-label="Duplicar tarea"
            title="Duplicar"
            className="icon-btn size-7"
          >
            <Copy size={12} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => removeTask(task.id)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-faint transition hover:bg-warn/10 hover:text-warn"
        >
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  )
}

function TaskRow({ task, active, h }: { task: Task; active: boolean; h: RowHandlers }) {
  const toggleTask = useStore((s) => s.toggleTask)
  const setActiveTask = useStore((s) => s.setActiveTask)

  const open = h.openId === task.id
  const dragging = h.draggingId === task.id
  const drop = h.drop?.id === task.id ? h.drop.place : null
  const tags = task.tags ?? []
  const over = task.pomodoros > task.estimate

  return (
    <li
      draggable={!task.done}
      onDragStart={(e) => h.onDragStart(e, task.id)}
      onDragEnd={h.onDragEnd}
      onDragOver={(e) => h.onDragOver(e, task.id)}
      onDrop={(e) => h.onDrop(e, task.id)}
      className={`group relative rounded-xl border transition-all duration-150 ${
        active
          ? 'border-accent/40 bg-accent/[0.09] shadow-sm'
          : 'border-transparent hover:border-line hover:bg-surface-2/60'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[3px] rounded-full transition-colors"
        style={{
          background: task.done
            ? 'var(--color-line)'
            : PRIORITY_COLOR[task.priority ?? 'media'],
        }}
      />
      {drop && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 z-10 h-[2px] rounded-full bg-accent ${
            drop === 'before' ? '-top-px' : '-bottom-px'
          }`}
        />
      )}

      <div className="flex items-start gap-3 py-2.5 pr-1.5 pl-4">
        <button
          type="button"
          onClick={() => toggleTask(task.id)}
          aria-label={task.done ? 'Marcar como pendiente' : 'Completar tarea'}
          aria-pressed={task.done}
          className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md border transition ${
            task.done
              ? 'border-break/50 bg-break/20 text-break'
              : 'border-line-soft bg-surface-2 text-transparent hover:border-accent/60 hover:text-accent/60'
          }`}
        >
          <Check size={12} strokeWidth={3} />
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => !task.done && setActiveTask(active ? null : task.id)}
            onDoubleClick={() => h.onToggleEditor(task.id)}
            disabled={task.done}
            className="block w-full text-left disabled:cursor-default"
            aria-label={
              task.done
                ? task.title
                : active
                  ? `Quitar ${task.title} del enfoque`
                  : `Enfocar ${task.title}`
            }
          >
            <p
              className={`truncate text-[13.5px] leading-5 ${
                task.done ? 'text-faint line-through' : 'text-fg'
              }`}
              title={task.title}
            >
              {task.title}
            </p>
          </button>

          <div className="mt-1 flex items-center gap-2">
            {tags.length > 0 && (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {tags.slice(0, 2).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => h.onTag(tag)}
                    title={`Filtrar por #${tag}`}
                    className={`truncate rounded text-[10px] transition ${
                      h.tagFilter === tag
                        ? 'bg-accent/15 px-1 text-accent'
                        : 'text-faint hover:text-accent'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
                {tags.length > 2 && (
                  <span className="text-[10px] text-faint">+{tags.length - 2}</span>
                )}
              </span>
            )}

            <div className="flex shrink-0 gap-[3px]" aria-hidden>
              {Array.from({ length: Math.min(task.estimate, 8) }).map((_, i) => (
                <span
                  key={i}
                  className={`h-[3px] w-2.5 rounded-full ${
                    i < task.pomodoros
                      ? 'bg-accent'
                      : task.done
                        ? 'bg-line'
                        : 'bg-surface-3'
                  }`}
                />
              ))}
            </div>
            <span className="shrink-0 text-[10.5px] text-faint tnum">
              {task.pomodoros}/{task.estimate}
            </span>
            {over && (
              <span className="shrink-0 text-[10px] text-warn tnum">
                +{task.pomodoros - task.estimate}
              </span>
            )}
            {active && !task.done && (
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium tracking-wide text-accent uppercase">
                <Target size={10} /> enfoque
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => h.onToggleEditor(task.id)}
          aria-expanded={open}
          aria-label={open ? 'Cerrar opciones' : `Opciones de ${task.title}`}
          className="icon-btn mt-0.5 size-7 shrink-0 text-faint opacity-40 transition group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 aria-expanded:opacity-100"
        >
          {open ? <X size={13} /> : <EllipsisVertical size={14} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line/70 py-2.5 pr-3 pl-4">
          <TaskEditor task={task} onClose={() => h.onToggleEditor(task.id)} />
        </div>
      )}
    </li>
  )
}

export function TasksPanel() {
  const [title, setTitle] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; place: DropPlace } | null>(null)

  const tasks = useStore((s) => s.tasks)
  const activeTaskId = useStore((s) => s.activeTaskId)
  const addTask = useStore((s) => s.addTask)
  const moveTask = useStore((s) => s.moveTask)
  const clearDone = useStore((s) => s.clearDone)

  const parsed = useMemo(() => parseTaskInput(title), [title])
  const canAdd = parsed.title.length > 0

  const pendingAll = sortPending(tasks)
  const doneAll = tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))

  const matches = (t: Task) => !tagFilter || (t.tags ?? []).includes(tagFilter)
  const pending = pendingAll.filter(matches)
  const done = doneAll.filter(matches)

  const groups = PRIORITY_ORDER.map((priority) => ({
    priority,
    items: pending.filter((t) => (t.priority ?? 'media') === priority),
  })).filter((g) => g.items.length > 0)
  const showGroupLabels = groups.length > 1

  const total = tasks.length
  const progress = total === 0 ? 0 : doneAll.length / total

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!canAdd) return
    addTask(parsed.title, {
      priority: parsed.priority,
      estimate: parsed.estimate,
      tags: parsed.tags,
    })
    setTitle('')
    setTagFilter(null)
  }

  const toggleEditor = (id: string) =>
    setOpenId((current) => (current === id ? null : id))

  const toggleTag = (tag: string) =>
    setTagFilter((current) => (current === tag ? null : tag))

  const startDrag = (e: DragEvent<HTMLLIElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }

  const overRow = (e: DragEvent<HTMLLIElement>, id: string) => {
    if (!draggingId || draggingId === id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const place: DropPlace = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDrop((prev) =>
      prev?.id === id && prev.place === place ? prev : { id, place },
    )
  }

  const dropRow = (e: DragEvent<HTMLLIElement>, id: string) => {
    e.preventDefault()
    const sourceId = draggingId ?? e.dataTransfer.getData('text/plain')
    if (sourceId && sourceId !== id) {
      moveTask(sourceId, id, drop?.id === id ? drop.place : 'before')
    }
    setDraggingId(null)
    setDrop(null)
  }

  const endDrag = () => {
    setDraggingId(null)
    setDrop(null)
  }

  const handlers: RowHandlers = {
    openId,
    draggingId,
    drop,
    tagFilter,
    onToggleEditor: toggleEditor,
    onTag: toggleTag,
    onDragStart: startDrag,
    onDragEnd: endDrag,
    onDragOver: overRow,
    onDrop: dropRow,
  }

  return (
    <section className="card flex min-h-[320px] flex-col">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <ListTodo size={14} className="text-faint" />
          <h2 className="card-title">Tareas</h2>
          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted tnum">
            {pending.length}
          </span>
        </div>
        {doneAll.length > 0 && (
          <button
            type="button"
            onClick={clearDone}
            className="text-[11px] text-faint transition hover:text-warn"
          >
            limpiar hechas
          </button>
        )}
      </div>

      <form onSubmit={submit} className="px-4 pb-3">
        <div className="relative">
          <Plus
            size={14}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿En qué vas a trabajar?"
            className="input pr-9 pl-8 text-[13px]"
            maxLength={160}
            aria-label="Nueva tarea"
            aria-describedby="task-quick-add-help"
          />
          {canAdd && (
            <button
              type="submit"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-lg bg-accent/15 p-1.5 text-accent transition hover:bg-accent/25"
              aria-label="Añadir tarea"
            >
              <Plus size={13} />
            </button>
          )}
        </div>

        <div
          id="task-quick-add-help"
          className="mt-1.5 flex min-h-[16px] flex-wrap items-center gap-1.5 px-1 text-[10px]"
        >
          {canAdd ? (
            <>
              {parsed.priority !== 'media' && (
                <span className="flex items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-muted">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: PRIORITY_COLOR[parsed.priority] }}
                  />
                  {PRIORITY_LABEL[parsed.priority]}
                </span>
              )}
              {parsed.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-surface-2 px-1.5 py-0.5 text-accent">
                  #{tag}
                </span>
              ))}
              {parsed.estimate !== 1 && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-muted tnum">
                  {parsed.estimate} pom
                </span>
              )}
            </>
          ) : (
            <span className="text-faint">
              atajos: <span className="text-muted">!alta</span> ·{' '}
              <span className="text-muted">#etiqueta</span> ·{' '}
              <span className="text-muted">*3</span> pomodoros
            </span>
          )}
        </div>
      </form>

      {tagFilter && (
        <div className="px-4 pb-2">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            aria-label={`Quitar filtro ${tagFilter}`}
            className="chip gap-1 border-accent/30 bg-accent/10 text-accent"
          >
            #{tagFilter} <X size={10} />
          </button>
        </div>
      )}

      <div className="divider mx-4 w-auto" />

      <div className="flex-1 overflow-y-auto px-2 py-2 scroll-thin">
        {tasks.length === 0 ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-6 text-center">
            <div className="grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-faint">
              <ListTodo size={17} />
            </div>
            <p className="text-[13px] text-muted">Sin tareas todavía</p>
            <p className="max-w-[230px] text-[11.5px] leading-relaxed text-faint">
              Añade una arriba con su prioridad (<span className="text-muted">!alta</span>).
              Arrástrala para ordenar y elige cuál enfocar: el pomodoro sumará ahí.
            </p>
          </div>
        ) : pending.length === 0 && done.length === 0 ? (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-[13px] text-muted">Nada con #{tagFilter}</p>
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className="text-[11px] text-accent hover:underline"
            >
              quitar filtro
            </button>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {groups.map((group) => (
              <Fragment key={group.priority}>
                {showGroupLabels && (
                  <li className="flex items-center gap-2 px-3 pt-2 pb-1">
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ background: PRIORITY_COLOR[group.priority] }}
                    />
                    <span className={LABEL}>{PRIORITY_LABEL[group.priority]}</span>
                    <span className="h-px flex-1 bg-line-soft" />
                  </li>
                )}
                {group.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    active={task.id === activeTaskId}
                    h={handlers}
                  />
                ))}
              </Fragment>
            ))}

            {done.length > 0 && (
              <li className="flex items-center gap-2 px-3 pt-3 pb-1">
                <span className="text-[10px] font-medium tracking-[0.14em] text-faint uppercase">
                  completadas
                </span>
                <span className="h-px flex-1 bg-line-soft" />
              </li>
            )}
            {done.map((task) => (
              <TaskRow key={task.id} task={task} active={false} h={handlers} />
            ))}
          </ul>
        )}
      </div>

      {total > 0 && (
        <div className="px-4 pt-1 pb-4">
          <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-faint">
            <span>Progreso del día</span>
            <span className="tnum">
              {doneAll.length}/{total}
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-break/70 transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
