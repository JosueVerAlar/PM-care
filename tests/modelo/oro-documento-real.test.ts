/**
 * La red antes de N9: qué producía la app sobre el documento real ANTES de que las
 * tareas pudieran colgar de una épica o de un proyecto.
 *
 * **Para qué existe.** «Aditivo» y «no rompe lo que ya hay» son afirmaciones, y una
 * afirmación no protege datos. Esto las convierte en una medida: se congeló la salida
 * completa del dominio sobre `datos/ejemplo.json` —los tres proyectos con datos reales de
 * SICOE— y cualquier cambio de esa salida rompe la prueba y hay que justificarlo a mano.
 *
 * Cubre lo que un documento sin novedades tiene que seguir haciendo igual: el avance y el
 * estado derivado de cada nodo, la ruta de cada tarea, las cuatro vistas transversales, la
 * carga por persona y —desde M5— todo lo que el reloj de tramos deriva.
 *
 * ## Por qué son DOS documentos y no uno
 *
 * `datos/ejemplo.json` es ciego a lo que M4 y M5 cambiaron, y no por estar bien: por no
 * ejercitarlo. Sus 35 tareas son 18 `pendiente`, 5 `iniciado`, 11 `done` y 1 `cancelada`
 * —**cero** `en_pruebas`, **cero** `terminado`— y todas traen `trabajo: []`. Con eso, meter
 * dos estados nuevos en el denominador del avance y construir el reloj entero no movió una
 * sola línea del archivo de oro.
 *
 * La salida no fue inventarle estados a `datos/ejemplo.json`. Ese archivo vale
 * exactamente por ser real —lo citan las maquetas, `docs/` y las aserciones concretas de
 * `tests/dominio/derivar.test.ts` sobre SICOE-E4 y SICOE-E5—, y un `en_pruebas` inventado
 * dentro dejaría a cualquier lector futuro sin forma de distinguir el dato del usuario del
 * andamio de una prueba. La red se cierra con un **documento hermano sintético**,
 * `fixtures/documento-reloj.json`, que dice en su nombre y en su descripción lo que es y
 * ejercita justo lo que al otro le falta. Los dos se congelan con el mismo procedimiento.
 *
 * Y `datos/ejemplo.json` no se queda fuera de lo nuevo: su radiografía ahora incluye el
 * bloque de tiempos, y ahí lo que se congela es que un documento sin tramos **no inventa
 * ceros** —promedios en `null`, listas vacías, ni un `0` de duración—, que es la mentira
 * que la regla 21 existe para prohibir.
 *
 * **Si esta prueba falla tras un cambio de esquema, la pregunta no es cómo actualizar el
 * archivo de oro: es qué documento del usuario acaba de cambiar de significado.**
 * Regenerar es legítimo solo cuando la diferencia se entendió y se quería:
 *
 *     ORO_REGENERAR=1 npx vitest run tests/modelo/oro-documento-real.test.ts
 *
 * y entonces el diff del `.json` se lee entero antes de confirmarlo.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Tarea } from '../../src/compartido/modelo/tipos';
import {
  avanceDeEpica,
  avanceDeHistoria,
  avanceDeProyecto,
  estadoDerivado,
  indexarTareas,
  mostrarPct,
  rutaDe,
  sinDesglosarDeEpica,
  sinDesglosarDeProyecto,
  sprintActivo,
} from '../../src/compartido/dominio/derivar';
import {
  paraBacklogDelArea,
  paraVistaBloqueos,
  paraVistaSprint,
  paraVistaTerminadas,
} from '../../src/compartido/dominio/clasificar';
import { cargaPorPersona, cargaSinAsignar } from '../../src/compartido/dominio/carga';
import {
  MINIMO_TAREAS_PARA_PROMEDIO,
  cerradasSinMedirEnTodo,
  desglosar,
  diasPorPunto,
  promediar,
  relojesCorriendo,
  resoluciones,
  tiempoEnDesarrollo,
  tiempoPorEquipo,
  tiempoPorPersona,
  tiempoPorProyecto,
  trabajadoContraCalendario,
  type FilaTiempo,
  type Promedio,
} from '../../src/compartido/dominio/duracion';

const RAIZ = path.resolve(__dirname, '..', '..');
const ORO_EJEMPLO = path.join(__dirname, 'oro-documento-real.json');
const ORO_RELOJ = path.join(__dirname, 'oro-documento-reloj.json');

/** Fija: el dominio recibe `hoy` como parámetro justamente para que esto sea posible. */
const HOY = '2026-08-27';

async function cargar(archivo: string): Promise<Documento> {
  const crudo: unknown = JSON.parse(await fs.readFile(archivo, 'utf8'));
  const resultado = validarDocumento(crudo);
  if (!resultado.ok) {
    throw new Error(
      `${archivo} no valida: ${resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join(' · ')}`,
    );
  }
  return resultado.documento as Documento;
}

/** Todas las tareas del documento, vivan donde vivan (N9). */
function todasLasTareas(doc: Documento): Tarea[] {
  return [...indexarTareas(doc).values()].map((u) => u.tarea);
}

/**
 * Un promedio, con `masLenta` reducida a su clave.
 *
 * La `Resolucion` completa arrastra la `Tarea` entera dentro, y un archivo de oro que
 * repite el título y la descripción de una tarea deja de ser legible justo cuando hay que
 * leerlo entero: en el diff.
 */
function promedioPlano(p: Promedio) {
  return {
    promedio: p.promedio,
    mediana: p.mediana,
    cuentan: p.cuentan,
    sinMedir: p.sinMedir,
    masLenta: p.masLenta === null ? null : p.masLenta.tarea.id,
  };
}

const filaPlana = (fila: FilaTiempo) => ({
  id: fila.id,
  nombre: fila.nombre,
  tiempo: promedioPlano(fila.tiempo),
});

/**
 * Lo que el reloj de tramos deriva del documento entero (regla 21).
 *
 * Nace con M5 y es la mitad que `datos/ejemplo.json` no puede vigilar por no tener un solo
 * tramo. Sobre ese documento congela los `null` y los vacíos, que ya es una afirmación con
 * contenido: **nada de esto puede empezar a devolver `0`**.
 */
function tiempos(doc: Documento) {
  const medidas = resoluciones(doc);

  return {
    // Ordenadas por clave: `resoluciones` recorre el índice, y el orden de inserción del
    // índice cambiaría con cualquier reordenamiento del árbol sin que cambie nada medido.
    medidas: medidas
      .map((m) => ({
        id: m.tarea.id,
        dias: m.dias,
        tramos: m.tramos,
        desarrollo: m.desarrollo,
        pruebas: m.pruebas,
        calendario: m.calendario,
        responsable: m.responsable,
        clave: m.clave,
        sprintsAtravesados: m.sprintsAtravesados,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),

    total: promedioPlano(promediar(medidas, cerradasSinMedirEnTodo(doc))),
    desglose: desglosar(medidas),
    transcurso: trabajadoContraCalendario(medidas),
    porPunto: diasPorPunto(medidas),
    cerradasSinMedir: cerradasSinMedirEnTodo(doc),

    // Se listan aparte porque no entran a ningún promedio, y el día que entren esta lista
    // y `medidas` cambian a la vez: es lo que hace visible el error.
    corriendo: relojesCorriendo(doc, HOY).map((r) => ({
      id: r.tarea.id,
      clave: r.clave,
      dias: r.dias,
      olvidado: r.olvidado,
    })),

    // Solo las tareas que TIENEN tramos. Las que no, se vigilan con una aserción propia
    // —«ninguna inventa un cero»— que dice más que 35 líneas de `null` en el diff.
    relojes: todasLasTareas(doc)
      .filter((tarea) => tarea.trabajo.length > 0)
      .map((tarea) => ({ id: tarea.id, ...tiempoEnDesarrollo(tarea) }))
      .sort((a, b) => a.id.localeCompare(b.id)),

    porPersona: tiempoPorPersona(doc).map(filaPlana),
    porEquipo: tiempoPorEquipo(doc).map(filaPlana),
    porProyecto: tiempoPorProyecto(doc).map(filaPlana),
  };
}

/**
 * Todo lo que el dominio dice de este documento, en una estructura comparable.
 *
 * Se guardan los conteos crudos junto al porcentaje a propósito (regla 3): si algún día
 * el porcentaje cambia, el conteo de al lado dice si cambió el cálculo o cambió el dato.
 */
function radiografia(doc: Documento) {
  const indice = indexarTareas(doc);
  const activo = sprintActivo(doc, null);

  return {
    proyectos: doc.proyectos.map((proyecto) => {
      const avance = avanceDeProyecto(proyecto);
      return {
        clave: proyecto.clave,
        avance,
        estado: estadoDerivado(avance),
        mostrarPct: mostrarPct(avance),
        sinDesglosar: sinDesglosarDeProyecto(proyecto),
        epicas: proyecto.epicas.map((epica) => {
          const avanceE = avanceDeEpica(epica);
          return {
            id: epica.id,
            avance: avanceE,
            estado: estadoDerivado(avanceE),
            sinDesglosar: sinDesglosarDeEpica(epica),
            historias: epica.historias.map((historia) => {
              const avanceH = avanceDeHistoria(historia);
              return {
                id: historia.id,
                avance: avanceH,
                estado: estadoDerivado(avanceH),
                tareas: historia.tareas.map((tarea) => tarea.id),
              };
            }),
          };
        }),
      };
    }),

    // El índice es lo que usan todas las vistas transversales: si una tarea deja de estar
    // indexada, desaparece del sprint, de bloqueos y de la carga a la vez.
    indice: [...indice.entries()]
      .map(([id, ubicacion]) => ({ id, ruta: rutaDe(ubicacion) }))
      .sort((a, b) => a.id.localeCompare(b.id)),

    vistas: {
      sprint: paraVistaSprint(doc, activo).map((fila) => fila.item.tarea_id),
      bloqueos: paraVistaBloqueos(doc).map((u) => u.tarea.id),
      terminadas: paraVistaTerminadas(doc).map((u) => u.tarea.id),
      backlogDelArea: paraBacklogDelArea(doc).map((u) => u.tarea.id),
    },

    carga: {
      personas: cargaPorPersona(doc, HOY).map((c) => ({
        id: c.personaId,
        abiertas: c.abiertas,
        enSprint: c.enSprint,
        abiertasFueraDelSprint: c.abiertasFueraDelSprint,
        historial: c.historial,
      })),
      sinAsignar: cargaSinAsignar(doc, HOY),
    },

    tiempos: tiempos(doc),
  };
}

const DOCUMENTOS = [
  {
    nombre: 'datos/ejemplo.json · el documento real, congelado antes de N9',
    archivo: path.join(RAIZ, 'datos', 'ejemplo.json'),
    oro: ORO_EJEMPLO,
  },
  {
    nombre: 'fixtures/documento-reloj.json · el hermano sintético que sí ejercita el reloj',
    archivo: path.join(__dirname, 'fixtures', 'documento-reloj.json'),
    oro: ORO_RELOJ,
  },
] as const;

describe.each(DOCUMENTOS)('$nombre', ({ archivo, oro }) => {
  it('produce exactamente lo que producía', async () => {
    const actual = radiografia(await cargar(archivo));

    if (process.env.ORO_REGENERAR === '1') {
      await fs.writeFile(oro, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    }

    const esperado: unknown = JSON.parse(await fs.readFile(oro, 'utf8'));
    expect(actual).toEqual(esperado);
  });

  /**
   * Regla 21, la mitad que no se ve en el archivo de oro porque son ausencias: una tarea
   * sin tramos no trabajó cero días, es que nadie la midió. Un `0` aquí sería un dato
   * inventado con formato de dato, y es lo mismo que el `0 %` de la regla 2.
   */
  it('ninguna tarea sin tramos inventa un cero', async () => {
    const doc = await cargar(archivo);
    const sinTramos = todasLasTareas(doc).filter((tarea) => tarea.trabajo.length === 0);
    // Sin esto el conjunto vacío pasaría solo (R2: toda prueba sobre un filtro lleva su
    // control de cobertura).
    expect(sinTramos.length).toBeGreaterThan(0);
    for (const tarea of sinTramos) {
      const reloj = tiempoEnDesarrollo(tarea);
      expect(reloj, tarea.id).toEqual({
        dias: null,
        tramos: 0,
        desarrollo: null,
        pruebas: null,
        corriendoDesde: null,
      });
    }
  });
});

describe('el documento real es la fuente de esta red', () => {
  /**
   * El documento de ejemplo es la fuente de esta red. Si se queda sin datos reales, la
   * prueba pasaría comparando nada contra nada.
   */
  it('el documento de partida tiene datos de verdad', async () => {
    const doc = await cargar(DOCUMENTOS[0].archivo);
    expect(doc.proyectos.length).toBeGreaterThanOrEqual(3);
    expect(indexarTareas(doc).size).toBeGreaterThanOrEqual(30);
  });

  /**
   * Lo que justifica que el hermano exista, escrito como medida y no como comentario.
   *
   * Sin esto, alguien puede vaciar el fixture de lo que lo hace útil y las dos pruebas de
   * oro siguen verdes comparando una radiografía pobre contra su copia. Cada línea nombra
   * un agujero que `datos/ejemplo.json` tiene abierto.
   */
  it('el hermano ejercita justo lo que a datos/ejemplo.json le falta', async () => {
    const doc = await cargar(DOCUMENTOS[1].archivo);
    const tareas = todasLasTareas(doc);
    const cuantas = (predicado: (t: Tarea) => boolean) => tareas.filter(predicado).length;

    // M4: los dos estados que entraron al denominador del avance.
    expect(cuantas((t) => t.estado === 'en_pruebas'), 'en_pruebas').toBeGreaterThan(0);
    expect(cuantas((t) => t.estado === 'terminado'), 'terminado').toBeGreaterThan(0);

    // M5: tramos cerrados, retomados, abiertos por debajo y por encima del umbral.
    expect(cuantas((t) => t.trabajo.some((x) => x.hasta !== null)), 'tramos cerrados').toBeGreaterThan(0);
    expect(cuantas((t) => t.trabajo.filter((x) => x.hasta !== null).length > 1), 'retomadas').toBeGreaterThan(0);
    expect(cuantas((t) => t.trabajo.some((x) => x.estado === 'en_pruebas')), 'tramo de pruebas').toBeGreaterThan(0);

    const corriendo = relojesCorriendo(doc, HOY);
    expect(corriendo.filter((r) => r.olvidado).length, 'olvidados').toBeGreaterThan(0);
    expect(corriendo.filter((r) => !r.olvidado).length, 'corriendo sin olvidar').toBeGreaterThan(0);

    // Aceptada sin nada que medir: la letra chica de todos los promedios.
    expect(cerradasSinMedirEnTodo(doc), 'aceptadas sin medir').toBeGreaterThan(0);

    // Y los dos lados del mínimo, que es lo que decide si un promedio se enseña o se calla.
    expect(resoluciones(doc).length, 'medibles').toBeGreaterThanOrEqual(MINIMO_TAREAS_PARA_PROMEDIO);
    const porProyecto = tiempoPorProyecto(doc);
    expect(porProyecto.some((f) => f.tiempo.promedio !== null), 'algún corte promedia').toBe(true);
    expect(porProyecto.some((f) => f.tiempo.promedio === null), 'algún corte se calla').toBe(true);
  });
});
