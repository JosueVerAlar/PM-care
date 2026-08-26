/**
 * Glifos e iconos. Copiados de la maqueta de E0, no reinventados.
 *
 * **El estado vive en la FORMA, no en el color.** Cinco siluetas distinguibles a 14px y
 * en escala de grises: círculo hueco, medio relleno, relleno con paloma, con diagonal y
 * punteado. La paleta de E0 se validó también en deuteranopía, pero la forma es lo que
 * sostiene la lectura si el color falla.
 *
 * `CuadroBloqueo` es el cuadrito que acompaña SIEMPRE a la palabra «Bloqueada» o a un
 * número: el rojo nunca viaja solo.
 */

/** Clave de forma. No es el enum de estado: `curso` cubre «en curso» y «en movimiento». */
export type FormaEstado = 'pendiente' | 'curso' | 'hecha' | 'cancelada' | 'sindesglosar';

const COMUNES = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;

function Pendiente() {
  return (
    <svg {...COMUNES} fill="none" stroke="currentColor" strokeWidth={1.4}>
      <circle cx="7" cy="7" r="4.4" />
    </svg>
  );
}

function Curso() {
  return (
    <svg {...COMUNES} fill="none">
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth={1.4} />
      <path d="M7 2.6a4.4 4.4 0 010 8.8z" fill="currentColor" />
    </svg>
  );
}

function Hecha() {
  return (
    <svg {...COMUNES}>
      <circle cx="7" cy="7" r="5" fill="currentColor" />
      <path
        d="M4.5 7.1 6.2 8.8 9.5 5.4"
        fill="none"
        stroke="var(--fondo-panel)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cancelada() {
  return (
    <svg {...COMUNES} fill="none" stroke="currentColor" strokeWidth={1.4}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="M4.2 9.8 9.8 4.2" strokeLinecap="round" />
    </svg>
  );
}

function SinDesglosar() {
  return (
    <svg {...COMUNES} fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray="2.2 2.2">
      <circle cx="7" cy="7" r="4.4" />
    </svg>
  );
}

const FORMAS: Record<FormaEstado, () => React.JSX.Element> = {
  pendiente: Pendiente,
  curso: Curso,
  hecha: Hecha,
  cancelada: Cancelada,
  sindesglosar: SinDesglosar,
};

/**
 * El glifo de estado, en su columna fija.
 *
 * `etiqueta` es obligatoria: el glifo nunca aparece sin su nombre accesible, porque es
 * la única representación del estado en la fila. Va como `title` para el ratón y como
 * texto para lectores de pantalla.
 */
export function Glifo({ forma, etiqueta }: { forma: FormaEstado; etiqueta: string }) {
  const Dibujo = FORMAS[forma];
  return (
    <span className={`glifo glifo--${forma}`} title={etiqueta}>
      <Dibujo />
      <span className="solo-lectores">{etiqueta}</span>
    </span>
  );
}

export function Chevron({ abierto, vacio }: { abierto: boolean; vacio: boolean }) {
  const clases = ['chevron'];
  if (abierto) clases.push('chevron--abierto');
  if (vacio) clases.push('chevron--vacio');
  return (
    <span className={clases.join(' ')} aria-hidden="true">
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 2 6.8 5 3.5 8" />
      </svg>
    </span>
  );
}

/** Cuadrito del canal de bloqueo. Siempre acompañado de la palabra o de un número. */
export function CuadroBloqueo() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      <rect width="8" height="8" rx="1.2" fill="currentColor" />
    </svg>
  );
}

// --- iconos de la barra lateral ---------------------------------------------

const LATERAL = {
  width: 15,
  height: 15,
  viewBox: '0 0 16 16',
  'aria-hidden': true,
} as const;

export type NombreIcono =
  | 'panorama'
  | 'sprint'
  | 'bloqueos'
  | 'terminadas'
  | 'backlog'
  | 'carga'
  | 'equipos';

const ICONOS: Record<NombreIcono, () => React.JSX.Element> = {
  panorama: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  sprint: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <rect x="2" y="3" width="12" height="11" rx="2" />
      <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" />
    </svg>
  ),
  bloqueos: () => (
    <svg {...LATERAL}>
      <rect x="3" y="3" width="10" height="10" rx="1.6" fill="currentColor" />
    </svg>
  ),
  terminadas: () => (
    <svg
      {...LATERAL}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8.4 6 11.9 13.5 4.4" />
    </svg>
  ),
  backlog: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h7" />
    </svg>
  ),
  carga: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
      <path d="M3 13V7M8 13V3M13 13v-4" />
    </svg>
  ),
  equipos: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <circle cx="6" cy="5.5" r="2.4" />
      <path d="M1.8 13.2c0-2.2 1.9-3.6 4.2-3.6s4.2 1.4 4.2 3.6" />
      <path d="M11 3.4a2.4 2.4 0 010 4.4M12.2 9.9c1.3.5 2.1 1.6 2.1 3.3" />
    </svg>
  ),
};

export function Icono({ nombre }: { nombre: NombreIcono }) {
  const Dibujo = ICONOS[nombre];
  return <Dibujo />;
}

export function IconoLateralColapsar() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <path d="M6 2.5v11" />
    </svg>
  );
}
