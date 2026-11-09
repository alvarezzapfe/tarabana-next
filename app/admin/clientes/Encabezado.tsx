/**
 * Migaja de pan de las pantallas de cliente.
 *
 * Estaba copiada igual en el alta y en la edicion; si cambia el estilo del
 * admin, cambia en un solo lugar.
 */
export default function Encabezado({ titulo }: { titulo: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 22 }}>
      <a
        href="/admin/clientes"
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 12.5, textDecoration: 'none' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Clientes
      </a>
      <span style={{ color: '#d1d5db' }}>/</span>
      <h1 style={{ margin: 0, color: '#111827', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>
        {titulo}
      </h1>
    </div>
  )
}
