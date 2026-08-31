/**
 * El id de un equipo lo TECLEA el usuario (N11, supuesto S5): no hay contador que lo
 * emita, porque un cuarto contador en `EsquemaContadores` sería maquinaria para diez
 * filas. Esto es lo que la pantalla necesita para pedirlo bien.
 *
 * ## Por qué el campo tiene que decir su forma ANTES de fallar
 *
 * Un id tecleado a mano con un patrón que solo conoce el esquema produce el peor
 * formulario posible: el usuario escribe «PM Frontend», pulsa crear y recibe un rechazo
 * que habla de una expresión regular. Aquí se resuelven las dos mitades del problema:
 *
 * - **`idEquipoSugerido`** propone uno bien formado desde la clave y el nombre
 *   (`PM` + «Frontend» → `pm-frontend`), igual que `claveSugerida` propone la clave de un
 *   proyecto y `idSugerido` el de una persona. Es una propuesta, no una imposición: el
 *   campo queda editable porque el id es lo que se va a leer en `tarea.equipo_id` dentro
 *   del JSON que el usuario edita a mano.
 * - **`problemaDeIdEquipo`** dice qué está mal mientras se escribe, con las MISMAS
 *   palabras que usaría el reductor al rechazarlo. Dos mensajes distintos para el mismo
 *   rechazo son dos verdades que divergen; este se adelanta, no sustituye.
 *
 * El id es inmutable en cuanto se crea el equipo —lo copia cada `tarea.equipo_id`—, así
 * que el momento de corregirlo es este y ninguno después. Quien decide sigue siendo el
 * reductor: si esta cuenta y aquella difirieran, manda aquella.
 */

/**
 * El mismo patrón que `EsquemaEquipo.shape.id`, escrito aquí por la única razón por la
 * que se admite duplicar algo: este módulo es del renderer y `esquema.ts` es la fuente.
 * Si divergieran, el campo aceptaría lo que el documento rechaza — por eso la prueba de
 * interfaz compara los dos textos contra el mismo caso.
 */
const PATRON_ID_EQUIPO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Cómo se escribe. Va en pantalla, junto al campo, antes de que nadie falle. */
export const FORMA_ID_EQUIPO = 'Minúsculas, números y guiones: «pm-frontend».';

/** Quita acentos y deja solo lo que el patrón admite. No valida: prepara. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Id propuesto para un equipo nuevo: `clave-nombre` en minúsculas («pm-frontend»).
 *
 * Lleva la clave del proyecto delante porque el id es único en TODO el documento, no
 * dentro del proyecto: un «frontend» a secas choca con el primer otro proyecto que quiera
 * el suyo, y ese choque llega justo cuando el usuario ya se acostumbró al nombre corto.
 *
 * Sin nombre todavía no se propone nada: un id que aparece solo con la clave («pm-») se
 * lee como un valor a medias y el usuario lo acepta sin mirarlo.
 */
export function idEquipoSugerido(clave: string, nombre: string): string {
  const cola = normalizar(nombre);
  if (cola === '') return '';
  const cabeza = normalizar(clave);
  return cabeza === '' ? cola : `${cabeza}-${cola}`;
}

/**
 * Qué le pasa a este id, o `null` si está bien.
 *
 * `ocupados` va de id a la descripción de quien lo tiene («"Frontend" de PM»), para poder
 * NOMBRAR el choque igual que el reductor. Un «ese id ya existe» a secas obliga a buscar
 * a mano en qué proyecto, que es justo el trabajo que la pantalla debería ahorrar.
 */
export function problemaDeIdEquipo(
  id: string,
  ocupados: ReadonlyMap<string, string>,
): string | null {
  if (id === '') return 'Escribe un id para el equipo.';
  if (!PATRON_ID_EQUIPO.test(id)) return FORMA_ID_EQUIPO;
  const dueno = ocupados.get(id);
  if (dueno !== undefined) return `Ya existe un equipo con el id «${id}»: ${dueno}.`;
  return null;
}
