/**
 * El almacén: cargar, guardar, restaurar. Es el único módulo que decide si se escribe.
 *
 * ## Las cuatro reglas que gobiernan este archivo
 *
 * 1. **Ante un documento que no entendemos: solo lectura, y no se escribe NADA**
 *    (regla 13). El fallo caro de esta etapa no es que la app reviente —eso se ve y se
 *    arregla—, sino que «repare» sola el JSON y se coma lo que el usuario escribió a
 *    mano. Cargar nunca escribe; la única escritura que ocurre sin que el usuario mande
 *    un comando es la creación del archivo en el primer arranque, cuando no hay nada que
 *    perder.
 * 2. **`stat` antes de cada escritura** (regla 16). Si la huella del archivo no es la que
 *    dejamos nosotros, alguien lo tocó por fuera: se abre conflicto y no se escribe. Sin
 *    merge automático, nunca.
 * 3. **Cola de un solo elemento con debounce de 500 ms.** Teclear un título son veinte
 *    escrituras; guardar veinte veces no aporta nada. Pero hay momentos en que perder el
 *    último medio segundo sí duele, y ahí se vacía de inmediato: cambio de estado, crear
 *    o eliminar, `window-blur` y `before-quit`.
 * 4. **La bitácora se anexa DESPUÉS de que el documento quedó en disco.** Al revés, un
 *    cierre a destiempo dejaría en `historial.jsonl` una línea contando una mutación que
 *    nunca se guardó — una historia que miente es peor que una historia incompleta.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { fechaDe } from '../../compartido/dominio/clasificar';
import { documentoVacio, validarDocumento } from '../../compartido/modelo/esquema';
import type { Documento, Instante } from '../../compartido/modelo/tipos';
import {
  ESQUEMA_VERSION,
  estadoDeVersion,
  explicarVersion,
  permiteEscritura,
} from '../../compartido/modelo/version';
import { requiereFlushInmediato, type Comando, type NombreComando } from '../comandos/tipos';

import { reducir } from '../comandos/reductor';
import type { EntradaHistorial, FuenteEvento } from '../historial/registrar';
import { registrar } from '../historial/registrar';
import { migrar } from '../migraciones';
import { barrerTemporales, escribirAtomico } from './escritura-atomica';
import {
  RETENCION_POR_OMISION,
  type Respaldo,
  type Retencion,
  copiarComo,
  listarRespaldos,
  marcaDeInstante,
  respaldarSiHaceFalta,
  rotar,
} from './respaldos';
import type { RutasAlmacen } from './rutas';
import { Vigilante, huellaDe, mismaHuella, type Huella } from './vigilante';

export const DEBOUNCE_MS = 500;

/** Tope de la pila de deshacer (D1 del plan). 20 pasos, snapshots del documento. */
export const TOPE_DESHACER = 20;

/**
 * Cómo se llama cada comando cuando se va a DESHACER.
 *
 * El menú Edición de macOS pide el objeto: «Deshacer capturar SICOE-T14», no «Deshacer».
 * El nombre tiene que salir de aquí y no del renderer: la interfaz solo se entera de los
 * comandos que ella misma manda y solo de los que le contestan `ok`, y esta pila crece
 * también cuando el guardado falla —se apila ANTES de escribir, que es lo correcto por la
 * regla 5— y cuando deshace alguien que no pasó por su instrumentación. Dos pilas
 * paralelas se descuadran un paso y ya no vuelven a cuadrar; una sola no puede.
 *
 * El `Record<NombreComando, …>` es la aserción de cobertura: añadir un comando al esquema
 * sin darle verbo aquí **no compila**. Sin eso, el comando nuevo saldría como «undefined»
 * en un menú del sistema.
 */
const VERBO_DESHACER: Record<NombreComando, string> = {
  crearProyecto: 'crear el proyecto',
  editarProyecto: 'editar el proyecto',
  cerrarProyecto: 'cerrar el proyecto',
  reabrirProyecto: 'reabrir el proyecto',
  eliminarProyecto: 'eliminar el proyecto',
  cerrarPlaneacion: 'cerrar la planeación',
  reabrirPlaneacion: 'reabrir la planeación',
  crearPersona: 'dar de alta a alguien',
  editarPersona: 'editar a esa persona',
  desactivarPersona: 'dar de baja a esa persona',
  reactivarPersona: 'reactivar a esa persona',
  eliminarPersona: 'eliminar a esa persona',
  fijarUsuario: 'cambiar quién eres',
  editarEquipo: 'editar el equipo',
  crearEpica: 'capturar',
  editarEpica: 'renombrar',
  eliminarEpica: 'eliminar',
  reordenarEpica: 'reordenar',
  crearHistoria: 'capturar',
  editarHistoria: 'renombrar',
  eliminarHistoria: 'eliminar',
  reordenarHistoria: 'reordenar',
  crearTarea: 'capturar',
  editarTarea: 'editar',
  eliminarTarea: 'eliminar',
  reordenarTarea: 'reordenar',
  cambiarEstado: 'cambiar el estado de',
  moverAlSprint: 'mandar al sprint',
  sacarDelSprint: 'sacar del sprint',
  cerrarSprint: 'cerrar el sprint',
  activarSprint: 'activar el sprint',
  crearSprint: 'crear el sprint',
  editarSprint: 'editar el sprint',
  eliminarSprint: 'eliminar el sprint',
  desactivarSprint: 'desactivar el sprint',
  bloquear: 'bloquear',
  desbloquear: 'desbloquear',
};

/**
 * El nombre de lo que revertiría el siguiente «Deshacer».
 *
 * Sale del evento que el reductor ya produjo, así que no hay una segunda fuente que
 * mantener. Un evento de sistema —restaurar un respaldo— no tiene verbo en la tabla: se
 * usa su resumen, que ya está escrito para leerse.
 */
function etiquetaDeshacer(evento: EntradaHistorial): string {
  const verbo = VERBO_DESHACER[evento.comando as NombreComando];
  if (verbo === undefined) return evento.resumen;
  const objeto = evento.item_id ?? evento.sprint_id ?? evento.proyecto_id;
  return objeto === null ? verbo : `${verbo} ${objeto}`;
}

/** Un paso deshacible: el documento anterior y cómo se llamaba lo que lo cambió. */
interface PasoDeshacer {
  documento: Documento;
  etiqueta: string;
}


export type MotivoSoloLectura =
  | 'json-invalido'
  | 'claves-duplicadas'
  | 'esquema-invalido'
  | 'version-no-escribible'
  | 'migracion-fallida'
  | 'error-lectura'
  | 'conflicto-externo';

export type AccionSugerida = 'reintentar' | 'restaurar' | 'abrir-en-editor' | 'descartar-cambios';

export interface Diagnostico {
  motivo: MotivoSoloLectura;
  /** Una frase sin jerga: qué pasó. */
  mensaje: string;
  /** Dónde: rutas del JSON o posiciones. Puede estar vacío. */
  problemas: string[];
  acciones: AccionSugerida[];
}

export interface InstantaneaAlmacen {
  modo: 'listo' | 'solo-lectura';
  /**
   * El documento va hacia el renderer entero: pintar el árbol lo necesita. Lo que nunca
   * viaja en dirección de ESCRITURA es el documento (regla 9); de vuelta solo van comandos.
   */
  documento: Documento | null;
  diagnostico: Diagnostico | null;
  puedeDeshacer: boolean;
  /**
   * Cómo se llama lo que revertiría el siguiente «Deshacer» («capturar SICOE-T14»), o
   * `null` si no hay nada que revertir. Es texto para pintar, nunca una decisión: quien
   * decide si se puede deshacer es `puedeDeshacer`.
   */
  etiquetaDeshacer: string | null;

  /** Hay cambios en memoria que aún no llegaron al disco. */
  hayPendientes: boolean;
  ruta: string;
  directorio: string;
}

export type RespuestaComando =
  | { ok: true; instantanea: InstantaneaAlmacen }
  | { ok: false; codigo: string; mensaje: string; detalles?: string[] };

export interface OpcionesRepositorio {
  /** Inyectable para que las pruebas no dependan del reloj. */
  reloj?: () => Instante;
  retencion?: Retencion;
  /** `false` en pruebas: `fs.watch` mantiene el proceso vivo y confunde los resultados. */
  vigilar?: boolean;
}

export class Repositorio {
  private documento: Documento | null = null;
  private diagnostico: Diagnostico | null = null;

  /** Huella de lo último que escribimos o leímos. Es la referencia del `stat` de guarda. */
  private huellaEsperada: Huella | null = null;

  /** Cola de UN elemento: un documento nuevo reemplaza al anterior, no se encola. */
  private pendiente: Documento | null = null;
  private temporizador: NodeJS.Timeout | null = null;
  private enVuelo: Promise<RespuestaGuardado> | null = null;

  /** Eventos aún no anexados. Se vacían tras un guardado exitoso, nunca antes. */
  private eventosPendientes: EntradaHistorial[] = [];

  private readonly pilaDeshacer: PasoDeshacer[] = [];


  private readonly marcaSesion: string;
  private readonly reloj: () => Instante;
  private readonly retencion: Retencion;
  private readonly vigilante: Vigilante | null;
  private suscriptores: ((instantanea: InstantaneaAlmacen) => void)[] = [];

  constructor(
    private readonly rutas: RutasAlmacen,
    opciones: OpcionesRepositorio = {},
  ) {
    this.reloj = opciones.reloj ?? instanteLocal;
    this.retencion = opciones.retencion ?? RETENCION_POR_OMISION;
    this.marcaSesion = marcaDeInstante(this.reloj());
    this.vigilante =
      opciones.vigilar === false
        ? null
        : new Vigilante({
            directorio: rutas.directorio,
            huellaPropia: () => this.huellaEsperada,
            alCambioExterno: (huella) => this.alCambioExterno(huella),
          });
  }

  // --- apertura -------------------------------------------------------------

  /**
   * Prepara el directorio y carga el documento. Idempotente: `reintentar()` es esto mismo.
   */
  async abrir(): Promise<InstantaneaAlmacen> {
    await fs.mkdir(this.rutas.directorio, { recursive: true });
    await fs.mkdir(this.rutas.respaldos, { recursive: true });

    // Un `.tmp-*` superviviente es, por construcción, una escritura que no terminó: si
    // hubiera terminado, el rename ya lo habría convertido en el documento. Se barre y
    // NUNCA se intenta recuperar.
    await barrerTemporales(this.rutas.directorio);

    await this.cargar();
    if (this.modo() === 'listo') this.vigilante?.iniciar();
    return this.estado();
  }

  /** Vuelve a leer el archivo desde cero. Es lo que hace el botón «Reintentar». */
  async reintentar(): Promise<InstantaneaAlmacen> {
    this.cancelarTemporizador();
    this.pendiente = null;
    this.eventosPendientes = [];
    this.pilaDeshacer.length = 0;
    await this.cargar();
    if (this.modo() === 'listo') this.vigilante?.iniciar();
    this.notificar();
    return this.estado();
  }

  private async cargar(): Promise<void> {
    this.documento = null;
    this.diagnostico = null;

    let crudo: string;
    try {
      crudo = await fs.readFile(this.rutas.documento, 'utf8');
    } catch (error) {
      if (esNoExiste(error)) {
        await this.crearPrimerDocumento();
        return;
      }
      this.entrarSoloLectura({
        motivo: 'error-lectura',
        mensaje: `No se pudo leer ${this.rutas.documento}: ${mensajeDe(error)}`,
        problemas: [],
        acciones: ['reintentar', 'abrir-en-editor'],
      });
      return;
    }

    // El BOM es el caso clásico de «lo abrí con otro editor»: `JSON.parse` revienta con un
    // mensaje incomprensible, así que se nombra antes de llegar ahí.
    if (crudo.charCodeAt(0) === 0xfeff) {
      this.entrarSoloLectura({
        motivo: 'json-invalido',
        mensaje:
          'El archivo empieza con una marca BOM (UTF-8 con firma). Guárdalo como UTF-8 sin BOM y reintenta.',
        problemas: ['byte 0: U+FEFF'],
        acciones: ['abrir-en-editor', 'reintentar', 'restaurar'],
      });
      return;
    }

    let valor: unknown;
    try {
      valor = JSON.parse(crudo);
    } catch (error) {
      this.entrarSoloLectura({
        motivo: 'json-invalido',
        mensaje: `El archivo no es JSON válido: ${mensajeDe(error)}`,
        problemas: [],
        acciones: ['abrir-en-editor', 'reintentar', 'restaurar'],
      });
      return;
    }

    // `JSON.parse` se queda callado con la última de dos claves repetidas. Si lo dejáramos
    // pasar, la primera escritura borraría la otra en silencio: exactamente el fallo que
    // la regla 14 prohíbe. Se detecta y se para.
    const duplicadas = clavesDuplicadas(crudo);
    if (duplicadas.length > 0) {
      this.entrarSoloLectura({
        motivo: 'claves-duplicadas',
        mensaje:
          'El archivo tiene claves repetidas dentro de un mismo objeto. Guardar así perdería una de las dos, así que no se toca.',
        problemas: duplicadas.slice(0, 20),
        acciones: ['abrir-en-editor', 'reintentar', 'restaurar'],
      });
      return;
    }

    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
      this.entrarSoloLectura({
        motivo: 'esquema-invalido',
        mensaje: 'El archivo es JSON pero no es un documento de PM-care (se esperaba un objeto).',
        problemas: [],
        acciones: ['abrir-en-editor', 'reintentar', 'restaurar'],
      });
      return;
    }

    let objeto = valor as Record<string, unknown>;
    const estadoVersion = estadoDeVersion(objeto['esquema_version']);
    if (!permiteEscritura(estadoVersion)) {
      this.entrarSoloLectura({
        motivo: 'version-no-escribible',
        mensaje: explicarVersion(estadoVersion, objeto['esquema_version']),
        problemas: [],
        acciones: ['restaurar', 'abrir-en-editor'],
      });
      return;
    }

    let migrado = false;
    if (estadoVersion === 'migrable') {
      const resultado = migrar(objeto, this.reloj());
      if (!resultado.ok) {
        this.entrarSoloLectura({
          motivo: 'migracion-fallida',
          mensaje: `No se pudo migrar el documento: ${resultado.motivo}`,
          problemas: [],
          acciones: ['restaurar', 'abrir-en-editor'],
        });
        return;
      }
      objeto = resultado.crudo;
      migrado = true;
    }

    const validado = validarDocumento(objeto);
    if (!validado.ok) {
      this.entrarSoloLectura({
        motivo: 'esquema-invalido',
        mensaje: `El documento no cumple el esquema (${validado.problemas.length} problemas). No se escribe nada hasta que decidas.`,
        problemas: validado.problemas.slice(0, 20).map((p) => `${p.ruta}: ${p.mensaje}`),
        acciones: ['abrir-en-editor', 'restaurar', 'reintentar'],
      });
      return;
    }

    this.documento = validado.documento;
    this.diagnostico = null;
    this.huellaEsperada = await huellaDe(this.rutas.documento);

    if (migrado) {
      // La copia previa a la migración queda EXENTA de rotación: es la única forma de
      // volver atrás si la migración resultó estar mal.
      await copiarComo(this.rutas, 'pre-migracion', `v${ESQUEMA_VERSION}-${marcaDeInstante(this.reloj())}`);
      this.eventosPendientes.push(
        eventoDeSistema(this.reloj(), 'migrar', 'migracion', `Documento migrado a la versión ${ESQUEMA_VERSION}`),
      );
      this.pendiente = this.documento;
      await this.vaciarCola();
    }
  }

  /**
   * Primer arranque: no hay archivo, así que crear uno vacío no puede comerse nada. Es la
   * única escritura que ocurre sin comando del usuario, y solo aquí — nunca como
   * «reparación» de un archivo que sí existe (regla 13).
   */
  private async crearPrimerDocumento(): Promise<void> {
    // Se pide a `documentoVacio()` en vez de repetir aquí la forma de la raíz: dos
    // literales del documento vacío divergen el día que la raíz estrena un campo, y el
    // que se quede corto es justo el que se escribe en el primer arranque.
    const vacio: Documento = documentoVacio();
    await escribirAtomico(this.rutas.documento, serializar(vacio));
    this.documento = vacio;
    this.huellaEsperada = await huellaDe(this.rutas.documento);
    await registrar(this.rutas.historial, [
      eventoDeSistema(this.reloj(), 'crearDocumento', 'sistema', 'Documento creado en el primer arranque'),
    ]);
  }

  // --- estado ---------------------------------------------------------------

  modo(): 'listo' | 'solo-lectura' {
    return this.documento !== null && this.diagnostico === null ? 'listo' : 'solo-lectura';
  }

  estado(): InstantaneaAlmacen {
    return {
      modo: this.modo(),
      documento: this.documento,
      diagnostico: this.diagnostico,
      puedeDeshacer: this.pilaDeshacer.length > 0,
      etiquetaDeshacer: this.pilaDeshacer[this.pilaDeshacer.length - 1]?.etiqueta ?? null,

      hayPendientes: this.pendiente !== null || this.enVuelo !== null,
      ruta: this.rutas.documento,
      directorio: this.rutas.directorio,
    };
  }

  alCambiar(suscriptor: (instantanea: InstantaneaAlmacen) => void): void {
    this.suscriptores.push(suscriptor);
  }

  private notificar(): void {
    const instantanea = this.estado();
    for (const suscriptor of this.suscriptores) suscriptor(instantanea);
  }

  private entrarSoloLectura(diagnostico: Diagnostico): void {
    this.diagnostico = diagnostico;
    // La pila de deshacer se vacía: sus snapshots describen otro archivo.
    this.pilaDeshacer.length = 0;
  }

  // --- comandos -------------------------------------------------------------

  async ejecutar(comando: Comando, fuente: FuenteEvento = 'ui'): Promise<RespuestaComando> {
    const previo = this.documento;
    if (previo === null || this.diagnostico !== null) {
      return {
        ok: false,
        codigo: 'solo-lectura',
        mensaje: this.diagnostico?.mensaje ?? 'El almacén está en modo solo lectura; no se escribe nada.',
      };
    }

    const resultado = reducir(previo, comando, this.reloj(), fuente);
    if (!resultado.ok) {
      const respuesta: RespuestaComando = {
        ok: false,
        codigo: resultado.error.codigo,
        mensaje: resultado.error.mensaje,
      };
      if (resultado.error.detalles !== undefined) respuesta.detalles = resultado.error.detalles;
      return respuesta;
    }

    this.apilarParaDeshacer(previo, etiquetaDeshacer(resultado.evento));
    this.documento = resultado.documento;

    this.eventosPendientes.push(resultado.evento);

    const guardado = await this.programar(requiereFlushInmediato(comando));
    if (guardado !== null && !guardado.ok) {
      return { ok: false, codigo: guardado.codigo, mensaje: guardado.mensaje };
    }
    this.notificar();
    return { ok: true, instantanea: this.estado() };
  }

  /**
   * Snapshots del documento entero, tope 20 (D1). Es caro en memoria comparado con
   * guardar operaciones inversas, y a cambio no hay forma de que deshacer produzca un
   * documento que nunca existió: el estado anterior ES el estado anterior.
   */
  private apilarParaDeshacer(documento: Documento, etiqueta: string): void {
    this.pilaDeshacer.push({ documento, etiqueta });
    if (this.pilaDeshacer.length > TOPE_DESHACER) this.pilaDeshacer.shift();
  }


  async deshacer(): Promise<RespuestaComando> {
    if (this.diagnostico !== null) {
      return { ok: false, codigo: 'solo-lectura', mensaje: 'No se puede deshacer en modo solo lectura.' };
    }
    const anterior = this.pilaDeshacer.pop();
    if (anterior === undefined) {
      return { ok: false, codigo: 'invalido', mensaje: 'No hay nada que deshacer.' };
    }
    this.documento = anterior.documento;

    this.eventosPendientes.push(
      eventoDeSistema(this.reloj(), 'deshacer', 'sistema', 'Deshacer: se restauró el estado anterior'),
    );
    const guardado = await this.programar(true);
    if (guardado !== null && !guardado.ok) {
      return { ok: false, codigo: guardado.codigo, mensaje: guardado.mensaje };
    }
    this.notificar();
    return { ok: true, instantanea: this.estado() };
  }

  // --- cola de escritura ----------------------------------------------------

  private async programar(inmediato: boolean): Promise<RespuestaGuardado | null> {
    this.pendiente = this.documento;
    this.cancelarTemporizador();
    if (inmediato) return this.vaciarCola();
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.vaciarCola().then((r) => {
        if (!r.ok) this.notificar();
      });
    }, DEBOUNCE_MS);
    return null;
  }

  /** Escribe ya lo que haya pendiente. Es lo que llaman `window-blur` y `before-quit`. */
  async guardarPendiente(): Promise<RespuestaGuardado> {
    return this.vaciarCola();
  }

  private cancelarTemporizador(): void {
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }

  private async vaciarCola(): Promise<RespuestaGuardado> {
    this.cancelarTemporizador();
    // Serializa: nunca dos escrituras del mismo documento a la vez.
    while (this.enVuelo !== null) await this.enVuelo.catch(() => undefined);
    const documento = this.pendiente;
    if (documento === null) return { ok: true, escrito: false };
    this.pendiente = null;

    this.enVuelo = this.escribirAhora(documento);
    try {
      return await this.enVuelo;
    } finally {
      this.enVuelo = null;
    }
  }

  private async escribirAhora(documento: Documento): Promise<RespuestaGuardado> {
    // Guarda de conflicto (regla 16). Esto —y no el `fs.watch`— es lo que impide pisar un
    // cambio externo: el watcher puede perder eventos, el `stat` no.
    const actual = await huellaDe(this.rutas.documento);
    if (!mismaHuella(actual, this.huellaEsperada)) {
      this.pendiente = documento; // no se pierde: el usuario decidirá qué hacer con él
      this.entrarSoloLectura({
        motivo: 'conflicto-externo',
        mensaje:
          'El archivo cambió fuera de PM-care desde la última vez que lo guardamos. No se sobrescribe nada: elige con qué versión quedarte.',
        problemas: [
          `en disco: ${describirHuella(actual)}`,
          `esperábamos: ${describirHuella(this.huellaEsperada)}`,
        ],
        acciones: ['reintentar', 'descartar-cambios', 'abrir-en-editor'],
      });
      this.notificar();
      return { ok: false, escrito: false, codigo: 'conflicto-externo', mensaje: this.diagnostico?.mensaje ?? '' };
    }

    try {
      const ahora = this.reloj();
      // Antes de tocar el documento: el respaldo copia lo que HAY, no lo que viene.
      await respaldarSiHaceFalta(this.rutas, this.marcaSesion, fechaDe(ahora));
      await rotar(this.rutas.respaldos, this.retencion);

      await escribirAtomico(this.rutas.documento, serializar(documento));
      // Se guarda la huella nueva ANTES de que el watcher reaccione, para que reconozca
      // este cambio como propio y no lo reporte como conflicto.
      this.huellaEsperada = await huellaDe(this.rutas.documento);
    } catch (error) {
      this.pendiente = documento;
      return {
        ok: false,
        escrito: false,
        codigo: 'error-escritura',
        mensaje: `No se pudo guardar: ${mensajeDe(error)}`,
      };
    }

    // La bitácora, solo ahora que el documento ya está en disco.
    const eventos = this.eventosPendientes;
    this.eventosPendientes = [];
    const anotado = await registrar(this.rutas.historial, eventos);
    return anotado.ok
      ? { ok: true, escrito: true }
      : { ok: true, escrito: true, avisoHistorial: anotado.mensaje };
  }

  // --- cambio externo -------------------------------------------------------

  private alCambioExterno(huella: Huella | null): void {
    // Sin merge automático (regla 16) y la pila de deshacer se vacía: sus snapshots
    // describen una historia que ya no es la del archivo.
    this.pilaDeshacer.length = 0;
    this.cancelarTemporizador();
    this.entrarSoloLectura({
      motivo: 'conflicto-externo',
      mensaje:
        'Alguien modificó el archivo de datos fuera de PM-care. Se dejó de escribir para no pisarlo.',
      problemas: [
        `en disco: ${describirHuella(huella)}`,
        `esperábamos: ${describirHuella(this.huellaEsperada)}`,
      ],
      acciones: ['reintentar', 'descartar-cambios', 'abrir-en-editor'],
    });
    this.notificar();
  }

  // --- respaldos ------------------------------------------------------------

  async respaldos(): Promise<Respaldo[]> {
    return listarRespaldos(this.rutas.respaldos);
  }

  /**
   * Restaura un respaldo por NOMBRE, y solo si aparece en el listado. No se acepta una
   * ruta: un nombre que llegue del renderer con `../` sería lectura arbitraria del disco
   * y escritura sobre cualquier archivo del usuario.
   */
  async restaurar(nombre: string): Promise<RespuestaComando> {
    const disponibles = await listarRespaldos(this.rutas.respaldos);
    const elegido = disponibles.find((r) => r.nombre === nombre);
    if (elegido === undefined) {
      return { ok: false, codigo: 'no-encontrado', mensaje: `No existe el respaldo "${nombre}".` };
    }

    const contenido = await fs.readFile(elegido.ruta, 'utf8').catch(() => null);
    if (contenido === null) {
      return { ok: false, codigo: 'error-lectura', mensaje: `No se pudo leer el respaldo "${nombre}".` };
    }

    let validado;
    try {
      validado = validarDocumento(JSON.parse(contenido));
    } catch (error) {
      return { ok: false, codigo: 'json-invalido', mensaje: `El respaldo "${nombre}" no es JSON válido: ${mensajeDe(error)}` };
    }
    if (!validado.ok) {
      return {
        ok: false,
        codigo: 'esquema-invalido',
        mensaje: `El respaldo "${nombre}" no cumple el esquema; no se restaura.`,
        detalles: validado.problemas.slice(0, 8).map((p) => `${p.ruta}: ${p.mensaje}`),
      };
    }

    // Lo que está en disco ahora mismo se preserva como `corrupto-*`, exento de rotación.
    // Es la única escritura que hacemos estando en solo lectura, y crea un archivo nuevo:
    // restaurar nunca puede ser la operación que destruya lo que el usuario quería salvar.
    await copiarComo(this.rutas, 'corrupto', marcaDeInstante(this.reloj()));

    this.cancelarTemporizador();
    this.pendiente = null;
    this.pilaDeshacer.length = 0;

    try {
      await escribirAtomico(this.rutas.documento, serializar(validado.documento));
    } catch (error) {
      return { ok: false, codigo: 'error-escritura', mensaje: `No se pudo restaurar: ${mensajeDe(error)}` };
    }

    this.documento = validado.documento;
    this.diagnostico = null;
    this.huellaEsperada = await huellaDe(this.rutas.documento);
    this.eventosPendientes = [];
    await registrar(this.rutas.historial, [
      eventoDeSistema(this.reloj(), 'restaurar', 'restauracion', `Documento restaurado desde el respaldo ${nombre}`),
    ]);
    this.vigilante?.iniciar();
    this.notificar();
    return { ok: true, instantanea: this.estado() };
  }

  // --- cierre ---------------------------------------------------------------

  /** Vacía la cola y suelta el watcher. Lo llama `before-quit`. */
  async cerrar(): Promise<RespuestaGuardado> {
    const resultado = await this.vaciarCola();
    this.vigilante?.detener();
    return resultado;
  }
}

export type RespuestaGuardado =
  | { ok: true; escrito: boolean; avisoHistorial?: string }
  | { ok: false; escrito: false; codigo: string; mensaje: string };

// --- utilidades del módulo --------------------------------------------------

/**
 * Dos espacios de sangría y salto final: el archivo lo abre y lo versiona un humano, así
 * que el diff de git tiene que ser legible. El costo en bytes es irrelevante aquí.
 */
function serializar(documento: Documento): string {
  return `${JSON.stringify(documento, null, 2)}\n`;
}

/**
 * Instante ISO con el desfase LOCAL, no `toISOString()` (que es UTC).
 *
 * No es cosmético: `fechaDe()` toma los diez primeros caracteres para saber qué día es, y
 * con UTC un cambio hecho a las 19:00 en Ciudad de México caería en el día siguiente. Eso
 * movería el respaldo diario y marcaría como «no planeada» una tarea capturada dentro del
 * plazo.
 */
function instanteLocal(fecha: Date = new Date()): Instante {
  const dos = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  const desfase = -fecha.getTimezoneOffset();
  const signo = desfase >= 0 ? '+' : '-';
  return (
    `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}` +
    `T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}` +
    `${signo}${dos(desfase / 60)}:${dos(desfase % 60)}`
  );
}

function eventoDeSistema(
  ts: Instante,
  comando: string,
  fuente: FuenteEvento,
  resumen: string,
): EntradaHistorial {
  return {
    ts,
    comando,
    fuente,
    proyecto_id: null,
    origen: null,
    epica_id: null,
    historia_id: null,
    item_id: null,
    sprint_id: null,
    resumen,
    detalle: null,
  };
}

function describirHuella(huella: Huella | null): string {
  if (huella === null) return 'no existe';
  return `${huella.bytes} bytes, modificado ${new Date(huella.mtimeMs).toISOString()}`;
}

function esNoExiste(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT';
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --- detección de claves duplicadas -----------------------------------------

/**
 * Recorre el texto JSON —ya sabemos que parsea— buscando claves repetidas dentro del
 * mismo objeto. `JSON.parse` se queda con la última y no dice nada, y esa es la vía por la
 * que la app se comería una nota del usuario sin que nadie se enterara.
 *
 * Devuelve rutas legibles: `proyectos[0].epicas[1].titulo`.
 */
export function clavesDuplicadas(texto: string): string[] {
  const problemas: string[] = [];
  let i = 0;
  const n = texto.length;

  const blancos = (): void => {
    while (i < n) {
      const c = texto[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') i += 1;
      else break;
    }
  };

  const cadena = (): string => {
    // Asume comilla en `i`. El texto ya parseó, así que no hay cierre faltante.
    i += 1;
    const inicio = i;
    while (i < n && texto[i] !== '"') i += texto[i] === '\\' ? 2 : 1;
    const crudo = texto.slice(inicio, i);
    i += 1;
    try {
      return JSON.parse(`"${crudo}"`) as string;
    } catch {
      return crudo;
    }
  };

  const valor = (ruta: string): void => {
    blancos();
    const c = texto[i];
    if (c === '{') {
      i += 1;
      const vistas = new Set<string>();
      blancos();
      if (texto[i] === '}') { i += 1; return; }
      for (;;) {
        blancos();
        const clave = cadena();
        const hijo = ruta === '' ? clave : `${ruta}.${clave}`;
        if (vistas.has(clave)) problemas.push(`clave repetida: ${hijo}`);
        vistas.add(clave);
        blancos();
        i += 1; // ':'
        valor(hijo);
        blancos();
        if (texto[i] === ',') { i += 1; continue; }
        i += 1; // '}'
        return;
      }
    }
    if (c === '[') {
      i += 1;
      blancos();
      if (texto[i] === ']') { i += 1; return; }
      let k = 0;
      for (;;) {
        valor(`${ruta}[${k}]`);
        k += 1;
        blancos();
        if (texto[i] === ',') { i += 1; continue; }
        i += 1; // ']'
        return;
      }
    }
    if (c === '"') { cadena(); return; }
    // número, true, false, null
    while (i < n) {
      const d = texto[i];
      if (d === ',' || d === '}' || d === ']' || d === ' ' || d === '\n' || d === '\r' || d === '\t') break;
      i += 1;
    }
  };

  valor('');
  return problemas;
}
