/**
 * Invariantes de las cinco vistas globales sobre 300 documentos generados.
 *
 * No afirman números concretos —eso lo hacen los archivos por vista— sino propiedades que
 * tienen que valer para CUALQUIER documento válido: que nada devuelva `NaN`, que ningún
 * porcentaje se muestre sin su conteo, que agrupar no pierda ni duplique filas, y que las
 * sumas cuadren con lo que hay en el árbol.
 *
 * Cada prueba imprime la semilla al fallar: el contraejemplo se reconstruye idéntico con
 * `prng(semilla)`.
 */

import { describe, expect, it } from 'vitest';

import {
  agruparBloqueos,
  filasDeBloqueos,
  resumenDeBloqueos,
} from '../../src/compartido/dominio/bloqueos';
import { agruparBacklog, filasDeBacklog } from '../../src/compartido/dominio/backlog';
import {
  cargaMaxima,
  cargaPorPersona,
  cargaSinAsignar,
  ordenarCargas,
  personasEnEquipos,
} from '../../src/compartido/dominio/carga';
import { estaAbierta, todasLasTareas } from '../../src/compartido/dominio/clasificar';
import { MINIMO_TAREAS_PARA_PCT, mostrarPct, sprintActivo } from '../../src/compartido/dominio/derivar';
import { panorama, type OrdenPanorama } from '../../src/compartido/dominio/panorama';
import {
  encabezadoDeSprint,
  registroDeTerminadas,
  terminadasFueraDeSprint,
  textoDeTerminadas,
} from '../../src/compartido/dominio/terminadas';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { SEMILLAS, prng, unDocumentoAleatorio } from '../apoyo/generador';

const HOY = '2026-08-26';
const ORDENES: readonly OrdenPanorama[] = ['atencion', 'quieto', 'nombre'];

/**
 * Dos retoques deterministas sobre lo que produce el generador compartido. El generador
 * NO se toca: lo comparten las suites de `derivar` y de los comandos, y cambiarlo movería
 * fixtures ajenos.
 *
 *  1. Fecha todos sus bloqueos el mismo día, así que los «días detenido» salen iguales y
 *     las invariantes de orden pasarían sin ejercer el orden. Se reparten entre el 15 de
 *     julio y hoy.
 *  2. Deja los items del sprint con los tres campos en `null`, así que el compromiso
 *     efectivo siempre coincide con la tarea y una vista que leyera la tarea directa
 *     —el bug del Backlog— pasaría igual. Se comprometen responsables y fechas en el
 *     ITEM, que es donde viven en los datos reales del usuario.
 */
function documento(semilla: number): Documento {
  const doc = unDocumentoAleatorio(prng(semilla), semilla);
  const rng = prng(semilla + 10_000);
  const conBloqueosFechados = {
    ...doc,
    proyectos: doc.proyectos.map((proyecto) => ({
      ...proyecto,
      epicas: proyecto.epicas.map((epica) => ({
        ...epica,
        historias: epica.historias.map((historia) => ({
          ...historia,
          tareas: historia.tareas.map((tarea) => ({
            ...tarea,
            bloqueos: tarea.bloqueos.map((bloqueo) => ({
              ...bloqueo,
              bloqueada_en: `${diaEntreJulioYHoy(rng())}T09:00:00-06:00`,
            })),
          })),
        })),
      })),
    })),
  };

  const personas = doc.personas;
  return {
    ...conBloqueosFechados,
    sprints: conBloqueosFechados.sprints.map((sprint) =>
      sprint.estado !== 'activo'
        ? sprint
        : {
            ...sprint,
            items: sprint.items.map((item) => ({
              ...item,
              responsable:
                personas.length > 0 && rng() < 0.5
                  ? (personas[Math.floor(rng() * personas.length)]?.id ?? null)
                  : null,
              fecha_limite: rng() < 0.5 ? diaEntreJulioYHoy(rng()) : null,
            })),
          },
    ),
  };
}

/** `2026-07-15` … `2026-08-26`, sin salirse de hoy: nada queda fechado en el futuro. */
function diaEntreJulioYHoy(sorteo: number): string {
  const dia = Math.floor(sorteo * 43);
  return dia < 17 ? `2026-07-${String(15 + dia).padStart(2, '0')}` : `2026-08-${String(dia - 16).padStart(2, '0')}`;
}

/** Recorre un objeto de conteos y falla nombrando el campo que trae `NaN`. */
function sinNaN(valor: unknown, donde: string): void {
  if (typeof valor === 'number') {
    expect(Number.isFinite(valor), `${donde} = ${valor}`).toBe(true);
    return;
  }
  if (Array.isArray(valor)) {
    valor.forEach((elemento, i) => sinNaN(elemento, `${donde}[${i}]`));
    return;
  }
  if (valor !== null && typeof valor === 'object') {
    for (const [clave, contenido] of Object.entries(valor)) {
      // Las ubicaciones cuelgan el árbol entero de la fila: no traen números derivados y
      // recorrerlas 300 veces solo alargaría la suite.
      if (clave === 'ubicacion' || clave === 'sprint' || clave === 'bloqueo') continue;
      sinNaN(contenido, `${donde}.${clave}`);
    }
  }
}

describe('el generador produce documentos válidos: si no, un fallo no distinguiría el bug del ruido', () => {
  it('las 300 semillas validan contra el esquema', () => {
    for (const semilla of SEMILLAS) {
      const resultado = validarDocumento(documento(semilla));
      expect(resultado.ok ? [] : resultado.problemas, `semilla ${semilla}`).toEqual([]);
    }
  });
});

describe('Panorama sobre 300 documentos', () => {
  it('ninguna tarjeta trae NaN en ningún campo', () => {
    for (const semilla of SEMILLAS) {
      const p = panorama(documento(semilla), HOY, 'atencion');
      sinNaN([...p.conBloqueos, ...p.sinBloqueos, ...p.sinCapturar], `semilla ${semilla}`);
    }
  });

  it('regla 2: el pct es null exactamente cuando no hay hojas, y nunca "NaN"', () => {
    for (const semilla of SEMILLAS) {
      const p = panorama(documento(semilla), HOY, 'quieto');
      for (const tarjeta of [...(p.unicaLista ?? []), ...p.sinCapturar]) {
        const donde = `semilla ${semilla} · ${tarjeta.clave}`;
        expect(tarjeta.avance.pct === null, donde).toBe(tarjeta.avance.hojas === 0);
        if (tarjeta.avance.pct !== null) {
          expect(tarjeta.avance.pct, donde).toBeGreaterThanOrEqual(0);
          expect(tarjeta.avance.pct, donde).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('regla 3: no se muestra porcentaje sin conteo suficiente detrás', () => {
    for (const semilla of SEMILLAS) {
      const p = panorama(documento(semilla), HOY, 'nombre');
      for (const tarjeta of p.unicaLista ?? []) {
        if (!mostrarPct(tarjeta.avance)) continue;
        expect(tarjeta.avance.hojas, `semilla ${semilla} · ${tarjeta.clave}`).toBeGreaterThanOrEqual(
          MINIMO_TAREAS_PARA_PCT,
        );
      }
    }
  });

  it('«quieto» es null o un entero no negativo: nunca un negativo ni un 0 inventado', () => {
    for (const semilla of SEMILLAS) {
      const p = panorama(documento(semilla), HOY, 'quieto');
      for (const tarjeta of p.unicaLista ?? []) {
        if (tarjeta.quieto === null) continue;
        const donde = `semilla ${semilla} · ${tarjeta.clave}`;
        expect(Number.isInteger(tarjeta.quieto), donde).toBe(true);
        expect(tarjeta.quieto, donde).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('cada proyecto no archivado aparece en una sección y en una sola, con los tres órdenes', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const vivos = doc.proyectos.filter((p) => !p.archivado).map((p) => p.clave).sort();
      for (const orden of ORDENES) {
        const p = panorama(doc, HOY, orden);
        const claves = [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? []), ...p.sinCapturar]
          .map((t) => t.clave)
          .sort();
        expect(claves, `semilla ${semilla} · ${orden}`).toEqual(vivos);
        expect(p.total, `semilla ${semilla} · ${orden}`).toBe(vivos.length);
      }
    }
  });

  it('los tres órdenes son deterministas: dos llamadas seguidas dan la misma lista', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      for (const orden of ORDENES) {
        const lista = () => {
          const p = panorama(doc, HOY, orden);
          return [...p.conBloqueos, ...p.sinBloqueos, ...(p.unicaLista ?? [])].map((t) => t.clave);
        };
        expect(lista(), `semilla ${semilla} · ${orden}`).toEqual(lista());
      }
    }
  });

  it('lo que va en «sin capturar» es exactamente lo que no tiene épicas', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const esperado = doc.proyectos
        .filter((p) => !p.archivado && p.epicas.length === 0)
        .map((p) => p.clave);
      const p = panorama(doc, HOY, 'atencion');
      expect(p.sinCapturar.map((t) => t.clave), `semilla ${semilla}`).toEqual(esperado);
    }
  });
});

describe('Bloqueos sobre 300 documentos', () => {
  it('las filas van siempre de más días a menos', () => {
    for (const semilla of SEMILLAS) {
      const dias = filasDeBloqueos(documento(semilla), HOY).map((f) => f.dias);
      const ordenadas = dias.slice().sort((a, b) => b - a);
      expect(dias, `semilla ${semilla}`).toEqual(ordenadas);
    }
  });

  it('los grupos van por su fila más vieja, y su diasMaximo es el máximo real de sus filas', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      for (const criterio of ['tipo', 'proyecto'] as const) {
        const grupos = agruparBloqueos(doc, HOY, criterio);
        const maximos = grupos.map((g) => g.diasMaximo);
        expect(maximos, `semilla ${semilla} · ${criterio}`).toEqual(
          maximos.slice().sort((a, b) => b - a),
        );
        for (const grupo of grupos) {
          expect(grupo.diasMaximo, `semilla ${semilla} · ${grupo.id}`).toBe(
            Math.max(...grupo.filas.map((f) => f.dias)),
          );
          expect(grupo.filas.length, `semilla ${semilla} · ${grupo.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('agrupar no pierde ni duplica filas', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const total = filasDeBloqueos(doc, HOY).length;
      for (const criterio of ['tipo', 'proyecto'] as const) {
        const ids = agruparBloqueos(doc, HOY, criterio).flatMap((g) =>
          g.filas.map((f) => f.ubicacion.tarea.id),
        );
        expect(ids.length, `semilla ${semilla} · ${criterio}`).toBe(total);
        expect(new Set(ids).size, `semilla ${semilla} · ${criterio}`).toBe(total);
      }
    }
  });

  it('el resumen cuadra con las filas y su diasMaximo es null solo si no hay ninguna', () => {
    for (const semilla of SEMILLAS) {
      const filas = filasDeBloqueos(documento(semilla), HOY);
      const resumen = resumenDeBloqueos(filas);
      const donde = `semilla ${semilla}`;
      sinNaN(resumen, donde);
      expect(resumen.total, donde).toBe(filas.length);
      expect(resumen.diasMaximo === null, donde).toBe(filas.length === 0);
      expect(resumen.proyectos, donde).toBeLessThanOrEqual(filas.length);
      expect(resumen.enSprintActivo, donde).toBeLessThanOrEqual(filas.length);
    }
  });
});

describe('Terminadas sobre 300 documentos', () => {
  it('el total de cada sprint es la suma de sus proyectos y cabe en sus items', () => {
    for (const semilla of SEMILLAS) {
      for (const registro of registroDeTerminadas(documento(semilla))) {
        const donde = `semilla ${semilla} · ${registro.sprint.id}`;
        const suma = registro.porProyecto.reduce((acc, p) => acc + p.tareas.length, 0);
        expect(suma, donde).toBe(registro.total);
        expect(registro.total + registro.noCompletadas, donde).toBeLessThanOrEqual(
          registro.sprint.items.length,
        );
      }
    }
  });

  it('el registro va del sprint más reciente al más viejo', () => {
    for (const semilla of SEMILLAS) {
      const inicios = registroDeTerminadas(documento(semilla)).map((r) => r.sprint.inicio);
      expect(inicios, `semilla ${semilla}`).toEqual(inicios.slice().sort().reverse());
    }
  });

  it('ninguna tarea está a la vez registrada y suelta, y toda hecha está en alguno de los dos', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const registradas = new Set(
        registroDeTerminadas(doc).flatMap((r) =>
          r.porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id)),
        ),
      );
      const sueltas = new Set(
        terminadasFueraDeSprint(doc).porProyecto.flatMap((p) =>
          p.tareas.map((t) => t.ubicacion.tarea.id),
        ),
      );
      for (const id of sueltas) {
        expect(registradas.has(id), `semilla ${semilla} · ${id}`).toBe(false);
      }
      for (const ubicacion of todasLasTareas(doc)) {
        if (ubicacion.tarea.estado !== 'hecha') continue;
        const id = ubicacion.tarea.id;
        expect(registradas.has(id) || sueltas.has(id), `semilla ${semilla} · ${id}`).toBe(true);
      }
    }
  });

  it('el texto pegable lleva una línea por tarea y nunca dice "undefined" ni "NaN"', () => {
    for (const semilla of SEMILLAS) {
      for (const registro of registroDeTerminadas(documento(semilla))) {
        const texto = textoDeTerminadas(encabezadoDeSprint(registro), registro.porProyecto, (i) =>
          i.slice(0, 10),
        );
        const donde = `semilla ${semilla} · ${registro.sprint.id}`;
        expect(texto.split('\n').filter((l) => l.startsWith('  · ')).length, donde).toBe(registro.total);
        expect(texto, donde).not.toContain('undefined');
        expect(texto, donde).not.toContain('NaN');
      }
    }
  });
});

describe('Backlog sobre 300 documentos', () => {
  it('los conteos se ordenan visibles <= enAlcance <= capturadas', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      for (const alcance of ['todas', 'sin-comprometer'] as const) {
        for (const texto of ['', 'tarea 1']) {
          const { filas, conteo } = filasDeBacklog(doc, HOY, alcance, texto);
          const donde = `semilla ${semilla} · ${alcance} · "${texto}"`;
          sinNaN(conteo, donde);
          expect(conteo.visibles, donde).toBe(filas.length);
          expect(conteo.visibles, donde).toBeLessThanOrEqual(conteo.enAlcance);
          expect(conteo.enAlcance, donde).toBeLessThanOrEqual(conteo.capturadas);
        }
      }
    }
  });

  it('con filtro vacío se ve todo el alcance: el filtro no descarta por casualidad', () => {
    for (const semilla of SEMILLAS) {
      const { conteo } = filasDeBacklog(documento(semilla), HOY, 'todas', '   ');
      expect(conteo.visibles, `semilla ${semilla}`).toBe(conteo.enAlcance);
    }
  });

  it('«todas» es exactamente el árbol entero', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const { conteo } = filasDeBacklog(doc, HOY, 'todas', '');
      expect(conteo.enAlcance, `semilla ${semilla}`).toBe(todasLasTareas(doc).length);
    }
  });

  it('vencida implica fecha del compromiso y tarea abierta: nunca se enciende sin fecha', () => {
    for (const semilla of SEMILLAS) {
      const { filas } = filasDeBacklog(documento(semilla), HOY, 'todas', '');
      for (const fila of filas) {
        if (!fila.vencida) continue;
        const donde = `semilla ${semilla} · ${fila.ubicacion.tarea.id}`;
        expect(fila.fechaLimite, donde).not.toBeNull();
        expect(estaAbierta(fila.ubicacion.tarea), donde).toBe(true);
      }
    }
  });

  it('cuando el item fija fecha o responsable, la fila muestra los del ITEM y no los de la tarea', () => {
    // La invariante que el bug original habría roto en silencio: con las fechas viviendo
    // solo en el item, leer la tarea deja la columna vacía sin lanzar ningún error.
    let comprometidas = 0;
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const activo = sprintActivo(doc);
      if (!activo) continue;
      const { filas } = filasDeBacklog(doc, HOY, 'todas', '');
      for (const fila of filas) {
        const item = activo.items.find((i) => i.tarea_id === fila.ubicacion.tarea.id);
        if (!item) continue;
        const donde = `semilla ${semilla} · ${fila.ubicacion.tarea.id}`;
        if (item.fecha_limite !== null) {
          expect(fila.fechaLimite, donde).toBe(item.fecha_limite);
          comprometidas += 1;
        }
        if (item.responsable !== null) {
          expect(fila.responsableId, donde).toBe(item.responsable);
          comprometidas += 1;
        }
      }
    }
    // Sin esto la prueba podría quedar verde sin haber mirado un solo compromiso.
    expect(comprometidas).toBeGreaterThan(100);
  });

  it('agrupar no pierde ni duplica filas, con cualquier agrupación', () => {
    for (const semilla of SEMILLAS) {
      const { filas } = filasDeBacklog(documento(semilla), HOY, 'todas', '');
      for (const agrupacion of ['proyecto', 'responsable', 'estado'] as const) {
        const ids = agruparBacklog(filas, agrupacion).flatMap((g) =>
          g.filas.map((f) => f.ubicacion.tarea.id),
        );
        const donde = `semilla ${semilla} · ${agrupacion}`;
        expect(ids.length, donde).toBe(filas.length);
        expect(new Set(ids).size, donde).toBe(filas.length);
      }
    }
  });

  it('cada fila queda bajo el mismo responsable que se le pinta', () => {
    for (const semilla of SEMILLAS) {
      const { filas } = filasDeBacklog(documento(semilla), HOY, 'todas', '');
      for (const grupo of agruparBacklog(filas, 'responsable')) {
        for (const fila of grupo.filas) {
          expect(fila.responsableId, `semilla ${semilla} · ${fila.ubicacion.tarea.id}`).toBe(
            grupo.personaId,
          );
        }
      }
    }
  });
});

describe('Carga sobre 300 documentos', () => {
  it('las personas más la fila sin asignar suman TODAS las abiertas del documento', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const abiertas = todasLasTareas(doc).filter((u) => estaAbierta(u.tarea)).length;
      const dePersonas = cargaPorPersona(doc, HOY).reduce((acc, c) => acc + c.abiertas.total, 0);
      expect(dePersonas + cargaSinAsignar(doc, HOY).abiertas.total, `semilla ${semilla}`).toBe(abiertas);
    }
  });

  it('las personas más la fila sin asignar suman TODOS los items del sprint activo', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const items = sprintActivo(doc)?.items.length ?? 0;
      const dePersonas = cargaPorPersona(doc, HOY).reduce((acc, c) => acc + c.enSprint.total, 0);
      expect(dePersonas + cargaSinAsignar(doc, HOY).enSprint.total, `semilla ${semilla}`).toBe(items);
    }
  });

  it('una tarea reasignada en el sprint cuenta en la barra del nuevo dueño, no en la del viejo', () => {
    let reasignadas = 0;
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const activo = sprintActivo(doc);
      if (!activo) continue;
      const porPersona = new Map(cargaPorPersona(doc, HOY).map((c) => [c.personaId, c]));
      for (const ubicacion of todasLasTareas(doc)) {
        const item = activo.items.find((i) => i.tarea_id === ubicacion.tarea.id);
        if (!item || item.responsable === null) continue;
        if (item.responsable === ubicacion.tarea.responsable) continue;
        if (!estaAbierta(ubicacion.tarea)) continue;
        reasignadas += 1;
        const donde = `semilla ${semilla} · ${ubicacion.tarea.id}`;
        const nuevo = porPersona.get(item.responsable);
        const clave = ubicacion.proyecto.clave;
        expect(
          nuevo?.abiertas.porProyecto.some((p) => p.clave === clave),
          `${donde}: debería estar en la barra de ${item.responsable}`,
        ).toBe(true);
        if (ubicacion.tarea.responsable === null) continue;
        const viejo = porPersona.get(ubicacion.tarea.responsable);
        const suyas = todasLasTareas(doc).filter(
          (u) =>
            estaAbierta(u.tarea) &&
            u.proyecto.clave === clave &&
            (activo.items.find((i) => i.tarea_id === u.tarea.id)?.responsable ??
              u.tarea.responsable) === ubicacion.tarea.responsable,
        ).length;
        expect(
          viejo?.abiertas.porProyecto.find((p) => p.clave === clave)?.abiertas ?? 0,
          `${donde}: no debe seguir contando para ${ubicacion.tarea.responsable}`,
        ).toBe(suyas);
      }
    }
    expect(reasignadas).toBeGreaterThan(50);
  });

  it('ninguna carga trae NaN ni un reparto que no cuadre con sus proyectos', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      for (const carga of [...cargaPorPersona(doc, HOY), cargaSinAsignar(doc, HOY)]) {
        const donde = `semilla ${semilla}`;
        sinNaN(carga.abiertas, donde);
        sinNaN(carga.enSprint, donde);
        const suma = carga.abiertas.porProyecto.reduce((acc, p) => acc + p.abiertas, 0);
        expect(suma, donde).toBe(carga.abiertas.total);
        expect(carga.abiertas.proyectosDistintos, donde).toBe(carga.abiertas.porProyecto.length);
      }
    }
  });

  it('cargaMaxima es null o un positivo, y coincide con la mayor de la lista', () => {
    for (const semilla of SEMILLAS) {
      const cargas = cargaPorPersona(documento(semilla), HOY);
      const maximo = cargaMaxima(cargas);
      const donde = `semilla ${semilla}`;
      if (cargas.length === 0 || cargas.every((c) => c.abiertas.total === 0)) {
        expect(maximo, donde).toBeNull();
        continue;
      }
      expect(maximo, donde).toBe(Math.max(...cargas.map((c) => c.abiertas.total)));
      expect(maximo, donde).toBeGreaterThan(0);
    }
  });

  it('ordenar no añade ni quita personas, y las inactivas quedan siempre al final', () => {
    for (const semilla of SEMILLAS) {
      const cargas = cargaPorPersona(documento(semilla), HOY);
      for (const orden of ['total', 'dispersion'] as const) {
        const ordenadas = ordenarCargas(cargas, orden);
        const donde = `semilla ${semilla} · ${orden}`;
        expect(ordenadas.map((c) => c.personaId).sort(), donde).toEqual(
          cargas.map((c) => c.personaId).sort(),
        );
        const activas = ordenadas.map((c) => c.activa);
        expect(activas.slice().sort((a, b) => Number(b) - Number(a)), donde).toEqual(activas);
      }
    }
  });

  it('personasEnEquipos devuelve un renglón por persona y su carga coincide con la barra', () => {
    for (const semilla of SEMILLAS) {
      const doc = documento(semilla);
      const porBarra = new Map(cargaPorPersona(doc, HOY).map((c) => [c.personaId, c.abiertas.total]));
      const enEquipos = personasEnEquipos(doc);
      expect(enEquipos.length, `semilla ${semilla}`).toBe(doc.personas.length);
      for (const fila of enEquipos) {
        expect(fila.abiertas, `semilla ${semilla} · ${fila.personaId}`).toBe(porBarra.get(fila.personaId));
      }
    }
  });
});
