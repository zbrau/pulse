/** ¿Estamos dentro de la ventana de Tauri (y no en un navegador)? */
export const isDesktop = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const requireDesktop = (): void => {
  if (!isDesktop()) {
    throw new Error(
      'El catálogo y el audio viven en el backend Rust: abre Pulse con «npm run desktop».',
    )
  }
}
