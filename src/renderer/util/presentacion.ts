/**
 * Traducción de valores del dominio a lo que se ve en pantalla.
 *
 * Aquí NO se calcula nada: son tablas de nombre y de forma. El cálculo entero vive en
 * `compartido/dominio/` y esta capa solo le pone etiqueta en español.
 *
 * Las etiquetas están fijadas por CLAUDE.md y no se improvisan:
 *   estado de tarea      Pendiente · En curso · Hecha · Cancelada
 *   estado derivado      Sin desglosar · Pendiente · En movimiento · Hecha
 *   bandera (no estado)  Bloqueada
 */

import type { EstadoDerivado } from '../../compartido/dominio/derivar';
import type { EstadoTarea, Fecha, Instante, TipoBloqueo } from '../../compartido/modelo/tipos';
import type { FormaEstado } from '../componentes/iconos';

const FORMA_TAREA: Record<EstadoTarea, FormaEstado> = {
  pendiente: 'pendiente',
  en_curso: 'curso',
  hecha: 'hecha',
  cancelada: 'cancelada',
};

const ETIQUETA_TAREA: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  hecha: 'Hecha',
  cancelada: 'Cancelada',
};

/**
 * Un contenedor reusa las formas de la tarea pero con otros nombres: la misma silueta de
 * «en curso» significa «en movimiento» cuando la lleva una épica. No hay una quinta
 * forma para contenedores porque no hay un quinto estado.
 */
const FORMA_DERIVADA: Record<EstadoDerivado, FormaEstado> = {
  sin_desglosar: 'sindesglosar',
  pendiente: 'pendiente',
  en_movimiento: 'curso',
  hecha: 'hecha',
};

const ETIQUETA_DERIVADA: Record<EstadoDerivado, string> = {
  sin_desglosar: 'Sin desglosar',
  pendiente: 'Pendiente',
  en_movimiento: 'En movimiento',
  hecha: 'Hecha',
};

export function formaDeTarea(estado: EstadoTarea): FormaEstado {
  return FORMA_TAREA[estado];
}

export function etiquetaDeTarea(estado: EstadoTarea): string {
  return ETIQUETA_TAREA[estado];
}

export function formaDerivada(estado: EstadoDerivado): FormaEstado {
  return FORMA_DERIVADA[estado];
}

export function etiquetaDerivada(estado: EstadoDerivado): string {
  return ETIQUETA_DERIVADA[estado];
}

// --- bloqueos ---------------------------------------------------------------

/**
 * Etiquetas de los tipos de bloqueo. El enum vive en el esquema; aquí solo su nombre.
 *
 * Se escribe la lista a mano en vez de leer `EsquemaTipoBloqueo.options`: importar el
 * esquema traería Zod al bundle del renderer para pintar cinco cadenas. El `Record`
 * tipado contra `TipoBloqueo` ya rompe la compilación si el esquema gana un tipo nuevo,
 * que es la garantía que importaba.
 */
const NOMBRE_BLOQUEO: Record<TipoBloqueo, string> = {
  dependencia: 'Depende de otra tarea',
  externo: 'Alguien de fuera',
  decision: 'Falta una decisión',
  informacion: 'Falta información',
  otro: 'Otro',
};

/**
 * Qué destraba a TODO un grupo del mismo tipo. Es la razón de agrupar por tipo y no por
 * proyecto: lo que se suelta con el mismo movimiento queda junto, y la frase lo nombra.
 *
 * No es una promesa de la app, es la salida típica: por eso está redactada como acción de
 * quien lee, no como predicción.
 */
const SALIDA_BLOQUEO: Record<TipoBloqueo, string> = {
  dependencia: 'se sueltan terminando la tarea de la que cuelgan',
  externo: 'no dependen del equipo: solo cabe dar seguimiento',
  decision: 'se sueltan en una sola reunión de decisión',
  informacion: 'se sueltan pidiendo el dato a quien lo tiene',
  otro: 'sin salida típica: cada uno se destraba a su manera',
};

export function etiquetaBloqueo(tipo: TipoBloqueo): string {
  return NOMBRE_BLOQUEO[tipo];
}

export function salidaBloqueo(tipo: TipoBloqueo): string {
  return SALIDA_BLOQUEO[tipo];
}

export const TIPOS_BLOQUEO: readonly TipoBloqueo[] = [
  'dependencia',
  'externo',
  'decision',
  'informacion',
  'otro',
];

/**
 * El nombre del proyecto sin repetir su clave.
 *
 * El usuario nombra sus proyectos como en Jira («SICOE — Control escolar»), y la barra
 * ya muestra la clave al lado: sin esto la cabecera dice «SICOE SICOE — Control
 * escolar». Se recorta el prefijo, no el nombre entero, para no perder la parte que
 * sí informa. Devuelve `null` si no quedaría nada que añadir.
 */
export function nombreSinClave(clave: string, nombre: string): string | null {
  if (!nombre.startsWith(clave)) return nombre;
  const resto = nombre.slice(clave.length).replace(/^\s*[—–-]\s*/, '').trim();
  return resto === '' ? null : resto;
}

// --- fechas -----------------------------------------------------------------

/**
 * Hoy, en formato de calendario `YYYY-MM-DD` y en la zona horaria local.
 *
 * Esta es la ÚNICA lectura del reloj de todo el renderer. El dominio es puro y recibe
 * `hoy` como parámetro; el reloj tiene que consultarse en algún borde, y este es el
 * borde. Se compone a mano en vez de con `toISOString()`, que devuelve UTC y a las 7 de
 * la tarde en Sinaloa ya cuenta como mañana.
 */
export function hoyLocal(reloj: Date = new Date()): Fecha {
  const mes = String(reloj.getMonth() + 1).padStart(2, '0');
  const dia = String(reloj.getDate()).padStart(2, '0');
  return `${reloj.getFullYear()}-${mes}-${dia}`;
}

const FORMATO_CORTO = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/**
 * `2026-08-27` -> `27 ago`. Se construye la fecha al mediodía para que ningún desfase de
 * zona horaria la corra un día hacia atrás.
 */
export function fechaCorta(fecha: Fecha): string {
  const partes = fecha.split('-');
  const [anio, mes, dia] = partes;
  if (anio === undefined || mes === undefined || dia === undefined) return fecha;
  const valor = new Date(Number(anio), Number(mes) - 1, Number(dia), 12);
  if (Number.isNaN(valor.getTime())) return fecha;
  return FORMATO_CORTO.format(valor).replace('.', '');
}

/** `2026-08-18T10:30:00-06:00` -> `18 ago`. */
export function instanteCorto(instante: Instante): string {
  return fechaCorta(instante.slice(0, 10));
}

/**
 * Marca de un respaldo (`2026-08-26T112000` o solo `2026-08-26`) a algo legible.
 *
 * Los respaldos «del día» no llevan hora: la parte de la hora se añade solo si está,
 * en vez de inventar un `00:00` que parece un dato.
 */
export function marcaRespaldo(marca: string): string {
  const fecha = fechaCorta(marca.slice(0, 10));
  if (marca.length < 15) return fecha;
  return `${fecha} ${marca.slice(11, 13)}:${marca.slice(13, 15)}`;
}

/** «1 día» / «6 días». Sin el singular roto que delata una plantilla. */
export function dias(n: number): string {
  return n === 1 ? '1 día' : `${n} días`;
}

/** Ordinal corto para el chip de arrastre: 2.º, 3.º… */
export function ordinal(n: number): string {
  return `${n}.º`;
}

/**
 * «1 tarea» / «12 tareas». El singular roto («1 tareas») delata una plantilla y hace que
 * el resto de la pantalla se lea como generada, no como escrita.
 */
export function cuenta(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function tareas(n: number): string {
  return cuenta(n, 'tarea', 'tareas');
}
