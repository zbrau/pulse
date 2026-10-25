/**
 * Copia el estado guardado bajo una clave antigua a la clave nueva.
 * Se usa una sola vez, en el renombrado de Sonora a Pulse, y sólo actúa si la
 * clave nueva todavía no existe (así nunca pisa datos más recientes).
 */
export const migrateStorageKey = (from: string, to: string): void => {
  try {
    if (localStorage.getItem(to) !== null) return
    const value = localStorage.getItem(from)
    if (value === null) return
    localStorage.setItem(to, value)
    localStorage.removeItem(from)
  } catch {
    // Sin almacenamiento disponible: la app sigue funcionando en memoria.
  }
}
