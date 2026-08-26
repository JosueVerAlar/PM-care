/**
 * Generador determinista de árboles.
 *
 * Sirve para las pruebas de invariantes: en vez de afirmar un número concreto sobre un
 * caso escrito a mano, se afirma una propiedad ("nunca `NaN`", "las hechas nunca superan
 * las hojas") sobre unos cientos de árboles distintos.
 *
 * **Por qué un PRNG propio y no `Math.random`:** un fallo con `Math.random` no se puede
 * reproducir. Aquí cada árbol tiene su semilla, la prueba la imprime al fallar y el caso
 * se vuelve a construir exactamente igual en la máquina de quien lo arregle.
 *
 * No se usó `fast-check`: ver la nota al pie de este archivo.
 */

import type { Documento, EstadoTarea, Proyecto, Sprint } from '../../src/compartido/modelo/tipos';
import { ESQUEMA_VERSION } from '../../src/compartido/modelo/version';

/** mulberry32: 32 bits de estado, distribución suficiente para elegir formas de árbol. */
export function prng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Aleatorio = () => number;

/** Entero en `[min, max]`, ambos incluidos. */
export function entero(rng: Aleatorio, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function elegir<T>(rng: Aleatorio, opciones: readonly T[]): T {
  const elegido = opciones[entero(rng, 0, opciones.length - 1)];
  if (elegido === undefined) throw new Error('elegir() sobre una lista vacía');
  return elegido;
}

const ESTADOS: readonly EstadoTarea[] = ['pendiente', 'en_curso', 'hecha', 'cancelada'];

export interface OpcionesArbol {
  clave?: string;
  maxEpicas?: number;
  maxHistorias?: number;
  maxTareas?: number;
}

/**
 * Un proyecto con forma aleatoria. Los mínimos son 0 a propósito: los contenedores
 * vacíos son justo el caso que las invariantes tienen que cubrir, así que el generador
 * los produce a menudo, no por casualidad.
 */
export function unProyectoAleatorio(rng: Aleatorio, opciones: OpcionesArbol = {}): Proyecto {
  const clave = opciones.clave ?? 'GEN';
  const maxEpicas = opciones.maxEpicas ?? 4;
  const maxHistorias = opciones.maxHistorias ?? 4;
  const maxTareas = opciones.maxTareas ?? 6;

  let nE = 0;
  let nH = 0;
  let nT = 0;

  const epicas = Array.from({ length: entero(rng, 0, maxEpicas) }, () => {
    nE += 1;
    return {
      id: `${clave}-E${nE}`,
      titulo: `Épica ${nE}`,
      descripcion: null,
      planeada: rng() < 0.8,
      clave_externa: null,
      historias: Array.from({ length: entero(rng, 0, maxHistorias) }, () => {
        nH += 1;
        return {
          id: `${clave}-H${nH}`,
          titulo: `Historia ${nH}`,
          descripcion: null,
          planeada: rng() < 0.8,
          clave_externa: null,
          tareas: Array.from({ length: entero(rng, 0, maxTareas) }, () => {
            nT += 1;
            return {
              id: `${clave}-T${nT}`,
              titulo: `Tarea ${nT}`,
              descripcion: null,
              estado: elegir(rng, ESTADOS),
              planeada: rng() < 0.75,
              responsable: null,
              fecha_limite: null,
              prioridad: null,
              creada_en: null,
              hecha_en: null,
              bloqueos: rng() < 0.15
                ? [
                    {
                      tipo: 'dependencia' as const,
                      motivo: 'generado',
                      bloqueada_en: '2026-08-10T09:00:00-06:00',
                      desbloqueada_en: null,
                    },
                  ]
                : [],
              clave_externa: null,
            };
          }),
        };
      }),
    };
  });

  return {
    clave,
    nombre: `Proyecto ${clave}`,
    descripcion: null,
    prioridad: null,
    archivado: false,
    planeacion_cerrada_en: null,
    contadores: { epicas: nE, historias: nH, tareas: nT },
    equipo: [],
    epicas,
    clave_externa: null,
  };
}

/**
 * Documento completo: varias personas, varios proyectos y sprints coherentes.
 *
 * Sale válido contra el esquema a propósito — una de las invariantes es justamente que
 * todo lo que el generador produce lo acepta `validarDocumento`. Si el generador
 * produjera basura, un fallo de esa prueba no distinguiría el bug del ruido.
 */
export function unDocumentoAleatorio(rng: Aleatorio, semilla: number): Documento {
  const personas = Array.from({ length: entero(rng, 0, 4) }, (_, i) => ({
    id: `persona-${i + 1}`,
    nombre: `Persona ${i + 1}`,
    activa: rng() < 0.85,
    clave_externa: null,
  }));

  const proyectos = Array.from({ length: entero(rng, 0, 3) }, (_, i) =>
    unProyectoAleatorio(rng, { clave: `GEN${i + 1}` }),
  );

  for (const proyecto of proyectos) {
    proyecto.equipo = personas
      .filter(() => rng() < 0.5)
      .map((persona) => ({ persona_id: persona.id, rol: null }));
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) {
          tarea.responsable = personas.length > 0 && rng() < 0.7 ? elegir(rng, personas).id : null;
        }
      }
    }
  }

  const idsDeTarea: string[] = [];
  for (const proyecto of proyectos) {
    for (const epica of proyecto.epicas) {
      for (const historia of epica.historias) {
        for (const tarea of historia.tareas) idsDeTarea.push(tarea.id);
      }
    }
  }

  // A lo sumo un sprint activo: el esquema lo exige y las vistas lo dan por cierto.
  const cuantos = entero(rng, 0, 3);
  const sprints: Sprint[] = Array.from({ length: cuantos }, (_, i) => {
    const cerrado = i < cuantos - 1;
    const dia = String(1 + i * 3).padStart(2, '0');
    const fin = String(2 + i * 3).padStart(2, '0');
    const disponibles = idsDeTarea.filter(() => rng() < 0.4);
    return {
      id: `S-${semilla}-${i + 1}`,
      nombre: `Sprint ${i + 1}`,
      inicio: `2026-06-${dia}`,
      fin: `2026-06-${fin}`,
      estado: cerrado ? ('cerrado' as const) : ('activo' as const),
      items: disponibles.map((tareaId) => ({
        tarea_id: tareaId,
        responsable: null,
        fecha_limite: null,
        prioridad: null,
        desenlace: cerrado
          ? elegir(rng, ['completada', 'no_terminada', 'cancelada'] as const)
          : null,
      })),
    };
  });

  return { esquema_version: ESQUEMA_VERSION, personas, proyectos, sprints };
}

/**
 * Semillas fijas. Una lista explícita en vez de `for (let s = 0; s < 300; s++)` porque
 * así la suite tarda lo mismo hoy que mañana y el conjunto no cambia por accidente.
 */
export const SEMILLAS: readonly number[] = Array.from({ length: 300 }, (_, i) => i + 1);

/*
 * Sobre `fast-check`: no se pidió instalarlo. Lo que aporta sobre esto es el shrinking —
 * reducir el contraejemplo al mínimo—, y aquí el contraejemplo YA es mínimo de leer: la
 * prueba imprime la semilla y el árbol se reconstruye idéntico con `prng(semilla)`. Las
 * invariantes en juego (no `NaN`, `null` en vacío, `hechas <= hojas`, `pct` en [0,100])
 * no necesitan generadores compuestos ni estados; sí los necesitaría una máquina de
 * estados sobre los comandos de mutación, y ahí (E5/E8) vuelvo a plantearlo.
 */
