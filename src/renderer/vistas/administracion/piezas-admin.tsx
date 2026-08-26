/**
 * Las piezas que comparten las tres secciones de Administración.
 *
 * Igual que `vistas/globales/piezas.tsx`: escrito una vez, corregido una vez. Ninguna
 * calcula nada; solo deciden marcas y clases.
 */

/**
 * La marca de un chip seleccionable.
 *
 * La pertenencia se señala con ✓ **y** peso **y** fondo, nunca solo con color: es la misma
 * regla que rige los canales de estado de toda la app. El hueco se reserva aunque no esté
 * marcado, o la fila entera baila al pulsar.
 */
export function Marca({ marcado }: { marcado: boolean }) {
  return (
    <span className={`chip-sel__marca${marcado ? '' : ' chip-sel__marca--hueca'}`} aria-hidden="true">
      <svg
        width="10"
        height="10"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 6.4 4.7 9 10 3.4" />
      </svg>
    </span>
  );
}
