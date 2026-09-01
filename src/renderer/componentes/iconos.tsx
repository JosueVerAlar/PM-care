/**
 * Glifos e iconos. Copiados de la maqueta de E0, no reinventados.
 *
 * **El estado vive en la FORMA, no en el color.** Siete siluetas distinguibles a 14px y en
 * escala de grises. La paleta de E0 se validó también en deuteranopía, pero la forma es lo
 * que sostiene la lectura si el color falla.
 *
 * ## MB · por qué son siete y no cinco
 *
 * Hasta M4 el dominio tenía cuatro estados de tarea y aquí bastaban cinco siluetas. Con
 * cinco estados de pipeline (`pendiente` · `iniciado` · `en_pruebas` · `terminado` ·
 * `done`) más `cancelada` y `sindesglosar` hacen falta siete, y las tres del medio se
 * pintaban con el MISMO círculo medio relleno: en pantalla eran indistinguibles.
 *
 * Los cinco pasos del pipeline son un **anillo de relleno progresivo** —vacío, ¼, ½, ¾,
 * lleno—, un cuadrante por paso. En sextos no cabría: cada escalón sería la mitad de tinta
 * y dos contiguos solo se separarían con las filas pegadas, que en un árbol no lo están.
 * `cancelada` conserva su diagonal y `sindesglosar` su punteado: no son pasos del pipeline,
 * son salirse de él y no haber entrado.
 *
 * **La geometría de las cinco formas que ya estaban no cambió ni un decimal.** Solo se
 * añadieron los dos cuadrantes que faltaban, para no invalidar la medición de E0 ni mover
 * el peso óptico de una columna que aparece en todas las pantallas.
 *
 * Medición en `maqueta/glifos.html`: los 21 pares en gris y en las tres dicromacias, con
 * su ancla —el par de escalón más flojo tiene MÁS área discriminante que `o`/`c` y que
 * `3`/`8` al tamaño del cuerpo de texto de esta app—.
 *
 * **Por eso `etiqueta` es obligatoria en `Glifo`**, y lo es en el tipo, no en una revisión:
 * con siete formas la silueta ya no se explica sola y un glifo sin nombre no compila.
 *
 * `CuadroBloqueo` es el cuadrito que acompaña SIEMPRE a la palabra «Bloqueada» o a un
 * número: el rojo nunca viaja solo.
 */

/**
 * Clave de forma. **No es el enum de estado.** Se conservan los cinco nombres que ya
 * existían para no renombrar en cascada las vistas que piden una forma por literal:
 *
 * - `curso` es el medio anillo, y cubre dos cosas de enums distintos: `en_pruebas` de una
 *   tarea y `en_movimiento` de un contenedor. Un contenedor no tiene pipeline, así que no
 *   pide los cuadrantes: «a media marcha» es todo lo que hay que decir de él.
 * - `hecha` cubre `done` de una tarea y `hecha` de un contenedor.
 */
export type FormaEstado =
  | 'pendiente'
  | 'iniciado'
  | 'curso'
  | 'terminado'
  | 'hecha'
  | 'cancelada'
  | 'sindesglosar';

export type TonoGlifo = 'pruebas';

const COMUNES = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true } as const;

function Pendiente() {
  return (
    <svg {...COMUNES} fill="none" stroke="currentColor" strokeWidth={1.4}>
      <circle cx="7" cy="7" r="4.4" />
    </svg>
  );
}

/**
 * ¼ · `iniciado`. El sector arranca a las 12 y avanza en el sentido del reloj, que es como
 * se lee cualquier medidor circular; cada paso siguiente añade el cuadrante de al lado.
 * El radio del relleno es el de la LÍNEA del anillo, no el de su filo: así el anillo sigue
 * leyéndose como anillo en vez de convertirse en un pastel.
 */
function Iniciado() {
  return (
    <svg {...COMUNES} fill="none">
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth={1.4} />
      <path d="M7 7 7 2.6A4.4 4.4 0 0 1 11.4 7Z" fill="currentColor" />
    </svg>
  );
}

/** ½ · `en_pruebas` de una tarea, `en_movimiento` de un contenedor. Sin cambios desde E0. */
function Curso() {
  return (
    <svg {...COMUNES} fill="none">
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth={1.4} />
      <path d="M7 2.6a4.4 4.4 0 010 8.8z" fill="currentColor" />
    </svg>
  );
}

/**
 * ¾ · `terminado` — «lo entregué», todavía sin aceptar. Es el paso que más se parece a
 * `done` y por eso es el que más margen necesita: el cuadrante que le falta muerde el
 * contorno, y `done` además es disco pleno con paloma. Medidos: 28.5 px² de área
 * discriminante, más del triple que el par `o`/`c` del cuerpo de texto.
 *
 * Bandera de arco grande en 1: son 270°, no 90°.
 */
function Terminado() {
  return (
    <svg {...COMUNES} fill="none">
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth={1.4} />
      <path d="M7 7 7 2.6A4.4 4.4 0 1 1 2.6 7Z" fill="currentColor" />
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
  iniciado: Iniciado,
  curso: Curso,
  terminado: Terminado,
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
export function Glifo({
  forma,
  etiqueta,
  tono,
}: {
  forma: FormaEstado;
  etiqueta: string;
  tono?: TonoGlifo;
}) {
  const Dibujo = FORMAS[forma];
  const claseTono = tono === undefined ? '' : ` glifo--tono-${tono}`;
  return (
    <span className={`glifo glifo--${forma}${claseTono}`} title={etiqueta}>
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

/**
 * El asa de reordenar: seis puntos.
 *
 * Es el gesto entero. Arrastrar la fila por el TEXTO manda la tarea al sprint; arrastrarla
 * por el asa la reordena entre sus hermanas. Que sean dos sitios distintos del mismo
 * renglón es lo que hace que no haya que adivinar cuál de los dos arrastres se empezó.
 *
 * DECORATIVO y sin parada de tabulador: el árbol tiene una sola (roving tabindex) y este
 * puñado de puntos no puede abrir trescientas más. El camino por teclado no es el asa,
 * son `⌥↑` / `⌥↓` sobre la fila enfocada, que además funcionan en ventana angosta.
 */
export function Asa() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true" fill="currentColor">
      <circle cx="3.4" cy="3.6" r="1.05" />
      <circle cx="6.6" cy="3.6" r="1.05" />
      <circle cx="3.4" cy="7" r="1.05" />
      <circle cx="6.6" cy="7" r="1.05" />
      <circle cx="3.4" cy="10.4" r="1.05" />
      <circle cx="6.6" cy="10.4" r="1.05" />
    </svg>
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

// --- E12 · glifos de la administración ---------------------------------------
// Los tres son DECORATIVOS: van con `aria-hidden` y nunca solos, siempre junto al texto
// que dicen lo mismo. Un candado sin la palabra «cerrado» no es información, es un adorno.

/** «Cerrado»: acompaña siempre a la fecha de cierre o al verbo. */
export function Candado() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <rect x="2.8" y="6.2" width="8.4" height="6" rx="1.4" />
      <path d="M4.8 6.2V4.6a2.2 2.2 0 014.4 0v1.6" />
    </svg>
  );
}

/** Triángulo de la zona de peligro. Nunca es el único aviso: el texto lo dice entero. */
export function Advertencia() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 .8 9.6 8.8H.4z" fill="currentColor" />
    </svg>
  );
}

/** Aspa de «quitar». El botón que la lleva siempre trae `title` y nombre accesible. */
export function Equis() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
      <path d="M2.4 2.4l5.2 5.2M7.6 2.4 2.4 7.6" />
    </svg>
  );
}

/** Cruz de «agregar». Igual: siempre junto a la palabra. */
export function Mas() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
      <path d="M6 2.5v7M2.5 6h7" />
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
  | 'equipos'
  | 'tiempos'
  // E12 · las tres secciones de Administración. Comparten la métrica de 15×15 de la
  // barra lateral para que la lista no se desalinee al llegar al separador.
  | 'proyectos'
  | 'personas';

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
  tiempos: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" />
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
  proyectos: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <path d="M1.8 4.4a1.6 1.6 0 011.6-1.6h2.4l1.4 1.7h5A1.6 1.6 0 0113.8 6v6a1.6 1.6 0 01-1.6 1.6H3.4A1.6 1.6 0 011.8 12z" />
    </svg>
  ),
  personas: () => (
    <svg {...LATERAL} fill="none" stroke="currentColor" strokeWidth={1.3}>
      <circle cx="8" cy="5.4" r="2.6" />
      <path d="M2.9 13.4c0-2.5 2.3-4.1 5.1-4.1s5.1 1.6 5.1 4.1" />
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
