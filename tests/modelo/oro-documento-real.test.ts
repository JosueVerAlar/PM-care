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
 * estado derivado de cada nodo, la ruta de cada tarea, las cuatro vistas transversales y
 * la carga por persona.
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
import type { Documento } from '../../src/compartido/modelo/tipos';
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

const RAIZ = path.resolve(__dirname, '..', '..');
const DOCUMENTO = path.join(RAIZ, 'datos', 'ejemplo.json');
const ORO = path.join(__dirname, 'oro-documento-real.json');

/** Fija: el dominio recibe `hoy` como parámetro justamente para que esto sea posible. */
const HOY = '2026-08-27';

async function documentoReal(): Promise<Documento> {
  const crudo: unknown = JSON.parse(await fs.readFile(DOCUMENTO, 'utf8'));
  const resultado = validarDocumento(crudo);
  if (!resultado.ok) {
    throw new Error(
      `datos/ejemplo.json no valida: ${resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join(' · ')}`,
    );
  }
  return resultado.documento as Documento;
}

/**
 * Todo lo que el dominio dice de este documento, en una estructura comparable.
 *
 * Se guardan los conteos crudos junto al porcentaje a propósito (regla 3): si algún día
 * el porcentaje cambia, el conteo de al lado dice si cambió el cálculo o cambió el dato.
 */
function radiografia(doc: Documento) {
  const indice = indexarTareas(doc);
  const activo = sprintActivo(doc);

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
  };
}

describe('el documento real, congelado antes de N9', () => {
  it('produce exactamente lo que producía', async () => {
    const actual = radiografia(await documentoReal());

    if (process.env.ORO_REGENERAR === '1') {
      await fs.writeFile(ORO, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    }

    const esperado: unknown = JSON.parse(await fs.readFile(ORO, 'utf8'));
    expect(actual).toEqual(esperado);
  });

  /**
   * El documento de ejemplo es la fuente de esta red. Si se queda sin datos reales, la
   * prueba pasaría comparando nada contra nada.
   */
  it('el documento de partida tiene datos de verdad', async () => {
    const doc = await documentoReal();
    expect(doc.proyectos.length).toBeGreaterThanOrEqual(3);
    expect(indexarTareas(doc).size).toBeGreaterThanOrEqual(30);
  });
});
