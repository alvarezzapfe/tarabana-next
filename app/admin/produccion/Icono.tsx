/**
 * Icono SVG de 24x24 con stroke currentColor.
 *
 * Mismo formato que los iconos del sidebar (`icon` en admin-nav.ts): un
 * string de `path`, varios subpaths separados por espacio. El OS no usa
 * emojis en el chrome.
 */
export default function Icono({
  d, size = 16, strokeWidth = 1.8, style,
}: {
  d: string
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  )
}
