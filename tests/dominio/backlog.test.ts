/**
 * Backlog del área.
 *
 * La prueba central de este archivo es el COMPROMISO EFECTIVO, porque ahí hubo un fallo
 * real y silencioso: las fechas límite y los responsables del sprint viven en el ITEM, y
 * la primera versión leía `tarea.fecha_limite`. No hubo excepción ni `NaN`: la columna
 * salía vacía entera y ninguna vencida se encendía.
 *
 * Por eso el fixture principal guarda las nueve fechas SOLO en los items y ninguna en las
 * tareas — como los datos reales del usuario. Un fixture con la fecha también en la tarea
 * pasaría con el código roto, así que la primera prueba del bloque vigila el fixture.
 */

import { describe, expect, it } from 'vitest';

import {
  AGRUPACION_POR_OMISION,
  ALCANCE_POR_OMISION,
  agruparBacklog,
  filasDeBacklog,
} from '../../src/compartido/dominio/backlog';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Tarea } from '../../src/compartido/modelo/tipos';
import {
  unBloqueo,
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaPersona,
  unaTarea,
} from '../apoyo/constructores';
import { todasLasTareas } from '../../src/compartido/dominio/clasificar';

const HOY = '2026-08-26';

const ana = unaPersona({ id: 'ana-lopez', nombre: 'Ana López' });
const jesus = unaPersona({ id: 'jesus-castillo', nombre: 'Jesús Castillo' });

/**
 * El documento del bug: todo el compromiso vive en el item.
 *
 * Ninguna tarea tiene `fecha_limite` ni `responsable` propios. Si alguien vuelve a leer la
 * tarea directamente, la columna de fecha se vacía, las vencidas se apagan y el agrupado
 * por responsable colapsa en un solo cajón «sin asignar».
 */
function documentoCompromisoEnItem(): Documento {
  const tareas: Tarea[] = [
    unaTarea({ id: 'SICOE-T1', clave: 'SICOE', titulo: 'Cargar el padrón', estado: 'iniciado' }),
    unaTarea({ id: 'SICOE-T2', clave: 'SICOE', titulo: 'Definir criterios', estado: 'pendiente' }),
    unaTarea({ id: 'SICOE-T3', clave: 'SICOE', titulo: 'Revisar actas', estado: 'pendiente' }),
    unaTarea({
      id: 'SICOE-T4',
      clave: 'SICOE',
      titulo: 'Regularizacion sin tilde',
      estado: 'pendiente',
      planeada: false,
      bloqueos: [unBloqueo({ bloqueada_en: '2026-08-16T09:00:00-06:00' })],
    }),
    unaTarea({ id: 'SICOE-T5', clave: 'SICOE', titulo: 'Cerrar el ciclo', estado: 'done' }),
    unaTarea({ id: 'SICOE-T6', clave: 'SICOE', titulo: 'Idea descartada', estado: 'cancelada' }),
  ];
  const otras: Tarea[] = [
    unaTarea({ id: 'BECAS-T1', clave: 'BECAS', titulo: 'Convocatoria', estado: 'pendiente' }),
    unaTarea({ id: 'BECAS-T2', clave: 'BECAS', titulo: 'Dictamen', estado: 'iniciado' }),
  ];

  return unDocumento({
    personas: [ana, jesus],
    proyectos: [
      unProyecto({
        clave: 'SICOE',
        nombre: 'Sistema de Control Escolar',
        epicas: [
          unaEpica({
            clave: 'SICOE',
            titulo: 'Regularización',
            historias: [unaHistoria({ clave: 'SICOE', titulo: 'Grupos de regularización', tareas })],
          }),
        ],
      }),
      unProyecto({
        clave: 'BECAS',
        nombre: 'Becas',
        epicas: [
          unaEpica({
            clave: 'BECAS',
            titulo: 'Trámites',
            historias: [unaHistoria({ clave: 'BECAS', titulo: 'Solicitudes', tareas: otras })],
          }),
        ],
      }),
    ],
    sprints: [
      unSprint({
        id: 'S-ACT',
        nombre: 'Sprint en curso',
        estado: 'activo',
        inicio: '2026-08-24',
        fin: '2026-09-04',
        items: [
          unItem('SICOE-T1', { responsable: 'jesus-castillo', fecha_limite: '2026-08-20' }),
          unItem('SICOE-T2', { responsable: 'ana-lopez', fecha_limite: '2026-09-30' }),
          unItem('SICOE-T3', { fecha_limite: '2026-08-01' }),
          unItem('SICOE-T5', { responsable: 'ana-lopez', fecha_limite: '2026-08-10' }),
          unItem('BECAS-T2', { responsable: 'jesus-castillo', fecha_limite: '2026-08-25' }),
        ],
      }),
    ],
  });
}

function filas(doc: Documento, alcance: 'todas' | 'sin-comprometer' = 'todas', texto = '') {
  return filasDeBacklog(doc, HOY, alcance, texto);
}

describe('el fixture del bug: el compromiso vive SOLO en el item', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoCompromisoEnItem());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });

  it('ninguna tarea tiene fecha ni responsable propios: si alguien se los pone, el fixture deja de medir', () => {
    // Vigila la prueba, no el código. Mover una fecha a la tarea haría pasar el módulo
    // roto, y este `expect` es lo que impide que eso ocurra sin que nadie se dé cuenta.
    const tareas = todasLasTareas(documentoCompromisoEnItem()).map((u) => u.tarea);
    expect(tareas.filter((t) => t.fecha_limite !== null)).toEqual([]);
    expect(tareas.filter((t) => t.responsable !== null)).toEqual([]);
  });

  it('los items sí las traen todas', () => {
    const items = documentoCompromisoEnItem().sprints[0]?.items ?? [];
    expect(items).toHaveLength(5);
    expect(items.filter((i) => i.fecha_limite !== null)).toHaveLength(5);
  });
});

describe('compromiso efectivo: la columna de fecha límite', () => {
  it('la fecha sale del item aunque la tarea no tenga ninguna', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    const conFecha = lista.filter((f) => f.fechaLimite !== null);
    expect(conFecha.map((f) => [f.ubicacion.tarea.id, f.fechaLimite])).toEqual([
      ['SICOE-T1', '2026-08-20'],
      ['SICOE-T2', '2026-09-30'],
      ['SICOE-T3', '2026-08-01'],
      ['SICOE-T5', '2026-08-10'],
      ['BECAS-T2', '2026-08-25'],
    ]);
  });

  it('las vencidas se encienden con la fecha del item: es el bug que se pinchó aquí', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    expect(lista.filter((f) => f.vencida).map((f) => f.ubicacion.tarea.id)).toEqual([
      'SICOE-T1',
      'SICOE-T3',
      'BECAS-T2',
    ]);
  });

  it('una cerrada no se marca vencida aunque su compromiso ya pasó', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    const hecha = lista.find((f) => f.ubicacion.tarea.id === 'SICOE-T5');
    expect(hecha?.fechaLimite).toBe('2026-08-10');
    expect(hecha?.vencida).toBe(false);
  });

  it('lo que no está en el sprint hereda la fecha de la tarea, sin item del que leer', () => {
    const base = documentoCompromisoEnItem();
    const doc = unDocumento({
      ...base,
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              historias: [
                unaHistoria({
                  clave: 'SOLA',
                  tareas: [unaTarea({ id: 'SOLA-T1', clave: 'SOLA', fecha_limite: '2026-08-02' })],
                }),
              ],
            }),
          ],
        }),
      ],
      sprints: [],
    });
    const fila = filas(doc).filas[0];
    expect(fila?.fechaLimite).toBe('2026-08-02');
    expect(fila?.vencida).toBe(true);
    expect(fila?.enSprintActivo).toBe(false);
  });

  it('con las dos fechas puestas manda la del item, aunque la de la tarea sea posterior', () => {
    const doc = unDocumento({
      personas: [ana],
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              historias: [
                unaHistoria({
                  clave: 'SOLA',
                  tareas: [
                    unaTarea({
                      id: 'SOLA-T1',
                      clave: 'SOLA',
                      responsable: 'ana-lopez',
                      fecha_limite: '2026-12-31',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      sprints: [
        unSprint({ estado: 'activo', items: [unItem('SOLA-T1', { fecha_limite: '2026-08-01' })] }),
      ],
    });
    const fila = filas(doc).filas[0];
    expect(fila?.fechaLimite).toBe('2026-08-01');
    expect(fila?.vencida).toBe(true);
    // El responsable no lo fija el item: sigue heredándose de la tarea.
    expect(fila?.responsableId).toBe('ana-lopez');
  });

  it('sin fecha en ningún lado la columna va en null, que no es «vence hoy»', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    const sinFecha = lista.find((f) => f.ubicacion.tarea.id === 'SICOE-T4');
    expect(sinFecha?.fechaLimite).toBeNull();
    expect(sinFecha?.vencida).toBe(false);
  });

  it('una fecha igual a hoy no está vencida: vencida es que ya pasó', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              historias: [
                unaHistoria({ clave: 'SOLA', tareas: [unaTarea({ id: 'SOLA-T1', clave: 'SOLA', fecha_limite: HOY })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(filas(doc).filas[0]?.vencida).toBe(false);
  });
});

describe('compromiso efectivo: el responsable', () => {
  it('el responsable sale del item aunque la tarea no tenga ninguno', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    const conDuenio = lista.filter((f) => f.responsableId !== null);
    expect(conDuenio.map((f) => [f.ubicacion.tarea.id, f.responsableId])).toEqual([
      ['SICOE-T1', 'jesus-castillo'],
      ['SICOE-T2', 'ana-lopez'],
      ['SICOE-T5', 'ana-lopez'],
      ['BECAS-T2', 'jesus-castillo'],
    ]);
  });

  it('resuelve el nombre para pintarlo, no el id crudo', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    expect(lista.find((f) => f.ubicacion.tarea.id === 'SICOE-T1')?.responsable).toBe('Jesús Castillo');
  });

  it('un item que reasigna mueve la fila al nuevo dueño y la quita del anterior', () => {
    const base = documentoCompromisoEnItem();
    const conDuenio = unDocumento({
      ...base,
      proyectos: base.proyectos.map((p) =>
        p.clave !== 'BECAS'
          ? p
          : unProyecto({
              clave: 'BECAS',
              nombre: 'Becas',
              epicas: [
                unaEpica({
                  clave: 'BECAS',
                  historias: [
                    unaHistoria({
                      clave: 'BECAS',
                      tareas: [
                        unaTarea({ id: 'BECAS-T1', clave: 'BECAS', estado: 'pendiente' }),
                        unaTarea({
                          id: 'BECAS-T2',
                          clave: 'BECAS',
                          estado: 'iniciado',
                          responsable: 'ana-lopez',
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
      ),
    });
    // BECAS-T2 es de Ana en el árbol y el item la comprometió con Jesús.
    const grupos = agruparBacklog(filas(conDuenio).filas, 'responsable');
    const deAna = grupos.find((g) => g.personaId === 'ana-lopez');
    const deJesus = grupos.find((g) => g.personaId === 'jesus-castillo');
    expect(deAna?.filas.map((f) => f.ubicacion.tarea.id)).not.toContain('BECAS-T2');
    expect(deJesus?.filas.map((f) => f.ubicacion.tarea.id)).toContain('BECAS-T2');
  });

  it('se agrupa por el MISMO responsable que se muestra, no por el de la tarea', () => {
    const grupos = agruparBacklog(filas(documentoCompromisoEnItem()).filas, 'responsable');
    for (const grupo of grupos) {
      for (const fila of grupo.filas) {
        expect(fila.responsableId, `${grupo.id} / ${fila.ubicacion.tarea.id}`).toBe(grupo.personaId);
      }
    }
  });

  it('un id que no está en el catálogo se pinta como el id, nunca como una raya', () => {
    // Defensa, no caso esperado: la validación cruzada rechaza este documento. Se prueba
    // porque el módulo lo promete por escrito y porque un `?? '—'` aquí escondería la fila.
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              historias: [
                unaHistoria({
                  clave: 'SOLA',
                  tareas: [unaTarea({ id: 'SOLA-T1', clave: 'SOLA', responsable: 'quien-se-fue' })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(filas(doc).filas[0]?.responsable).toBe('quien-se-fue');
  });
});

describe('alcance', () => {
  it('el alcance por omisión es «todas» y la agrupación por omisión es por proyecto', () => {
    expect(ALCANCE_POR_OMISION).toBe('todas');
    expect(AGRUPACION_POR_OMISION).toBe('proyecto');
  });

  it('«todas» incluye hechas y canceladas: es lo que hace que agrupar por estado signifique algo', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem(), 'todas');
    const estados = new Set(lista.map((f) => f.ubicacion.tarea.estado));
    expect(estados).toEqual(new Set(['iniciado', 'pendiente', 'done', 'cancelada']));
    expect(lista).toHaveLength(8);
  });

  it('«sin-comprometer» deja fuera lo cerrado y lo que ya está en el sprint activo', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem(), 'sin-comprometer');
    expect(lista.map((f) => f.ubicacion.tarea.id)).toEqual(['SICOE-T4', 'BECAS-T1']);
    expect(lista.every((f) => !f.enSprintActivo)).toBe(true);
  });

  it('sin sprint activo, «sin-comprometer» es todo lo abierto', () => {
    const base = documentoCompromisoEnItem();
    const doc = unDocumento({ ...base, sprints: [] });
    const { filas: lista } = filas(doc, 'sin-comprometer');
    expect(lista.map((f) => f.ubicacion.tarea.id)).toEqual([
      'SICOE-T1',
      'SICOE-T2',
      'SICOE-T3',
      'SICOE-T4',
      'BECAS-T1',
      'BECAS-T2',
    ]);
    expect(lista.every((f) => f.fechaLimite === null)).toBe(true);
  });

  it('un documento sin nada capturado da listas vacías y conteos en cero', () => {
    expect(filas(unDocumento())).toEqual({
      filas: [],
      conteo: { enAlcance: 0, visibles: 0, capturadas: 0 },
    });
  });
});

describe('conteo', () => {
  it('capturadas es el denominador honesto: todas las tareas del documento', () => {
    expect(filas(documentoCompromisoEnItem(), 'sin-comprometer').conteo.capturadas).toBe(8);
  });

  it('enAlcance se mide ANTES del filtro y visibles después', () => {
    const { conteo } = filas(documentoCompromisoEnItem(), 'todas', 'padron');
    expect(conteo).toEqual({ enAlcance: 8, visibles: 1, capturadas: 8 });
  });

  it('visibles coincide siempre con las filas devueltas', () => {
    for (const texto of ['', 'regularizacion', 'nada-de-nada', 'becas']) {
      const { filas: lista, conteo } = filas(documentoCompromisoEnItem(), 'todas', texto);
      expect(conteo.visibles, texto).toBe(lista.length);
      expect(conteo.visibles, texto).toBeLessThanOrEqual(conteo.enAlcance);
      expect(conteo.enAlcance, texto).toBeLessThanOrEqual(conteo.capturadas);
    }
  });
});

describe('el filtro de texto compara sin acentos y sin mayúsculas', () => {
  const ids = (texto: string) =>
    filas(documentoCompromisoEnItem(), 'todas', texto).filas.map((f) => f.ubicacion.tarea.id);

  it('«regularizacion» encuentra «Regularización»', () => {
    // El título de la épica lleva tilde; quien busca no la escribe.
    expect(ids('regularizacion')).toHaveLength(6);
  });

  it('y al revés: «Regularización» encuentra el título escrito sin tilde', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              titulo: 'Tramites',
              historias: [
                unaHistoria({
                  clave: 'SOLA',
                  tareas: [unaTarea({ id: 'SOLA-T1', clave: 'SOLA', titulo: 'Regularizacion de grupos' })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(filas(doc, 'todas', 'Regularización').filas).toHaveLength(1);
    expect(filas(doc, 'todas', 'TRÁMITES').filas).toHaveLength(1);
  });

  it('ignora mayúsculas y espacios de sobra alrededor', () => {
    expect(ids('  PADRÓN  ')).toEqual(['SICOE-T1']);
  });

  it('busca en el id, en el título, en la historia, en la épica y en el proyecto', () => {
    expect(ids('SICOE-T1')).toEqual(['SICOE-T1']);
    expect(ids('grupos de regularizacion')).toHaveLength(6);
    expect(ids('control escolar')).toHaveLength(6);
    expect(ids('BECAS')).toHaveLength(2);
  });

  it('busca por el nombre resuelto del responsable, con o sin tilde', () => {
    expect(ids('jesús castillo')).toEqual(['SICOE-T1', 'BECAS-T2']);
    expect(ids('jesus')).toEqual(['SICOE-T1', 'BECAS-T2']);
  });

  it('un filtro vacío o de puro espacio deja pasar todo, sin filtrar por casualidad', () => {
    for (const texto of ['', '   ', '\t']) {
      const { filas: lista, conteo } = filas(documentoCompromisoEnItem(), 'todas', texto);
      expect(lista, JSON.stringify(texto)).toHaveLength(8);
      expect(conteo.visibles, JSON.stringify(texto)).toBe(conteo.enAlcance);
    }
  });

  it('una aguja que no existe devuelve cero filas, no la lista entera', () => {
    expect(ids('zzz-no-existe')).toEqual([]);
  });

  it('una fila sin responsable no casa por el hueco vacío que deja al buscar', () => {
    // El pajar une los campos con espacios y el responsable nulo entra como ''. Si la
    // comparación fuera laxa, cualquier aguja casaría con ese hueco.
    const doc = documentoCompromisoEnItem();
    const sinDuenio = filas(doc).filas.filter((f) => f.responsableId === null);
    expect(sinDuenio.length).toBeGreaterThan(0);
    expect(ids('ana lopez')).toEqual(['SICOE-T2', 'SICOE-T5']);
  });

  it('la ñ también se compara descompuesta: «contrasenas» encuentra «contraseñas»', () => {
    // Efecto colateral asumido de NFD: «año» y «ano» se vuelven la misma cadena. Es una
    // comparación de búsqueda, no una traducción, y aquí queda dicho.
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'SOLA',
          nombre: 'Sola',
          epicas: [
            unaEpica({
              clave: 'SOLA',
              historias: [
                unaHistoria({
                  clave: 'SOLA',
                  tareas: [unaTarea({ id: 'SOLA-T1', clave: 'SOLA', titulo: 'Restablecimiento de contraseñas' })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(filas(doc, 'todas', 'contrasenas').filas).toHaveLength(1);
    expect(filas(doc, 'todas', 'contraseñas').filas).toHaveLength(1);
  });
});

describe('agruparBacklog', () => {
  it('agrupar no pierde ni duplica filas, se agrupe como se agrupe', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    for (const agrupacion of ['proyecto', 'responsable', 'estado'] as const) {
      const grupos = agruparBacklog(lista, agrupacion);
      const ids = grupos.flatMap((g) => g.filas.map((f) => f.ubicacion.tarea.id));
      expect(ids, agrupacion).toHaveLength(lista.length);
      expect(new Set(ids).size, agrupacion).toBe(lista.length);
    }
  });

  it('por proyecto conserva el orden del documento y resuelve el nombre', () => {
    const grupos = agruparBacklog(filas(documentoCompromisoEnItem()).filas, 'proyecto');
    expect(grupos.map((g) => [g.id, g.nombre, g.filas.length])).toEqual([
      ['SICOE', 'Sistema de Control Escolar', 6],
      ['BECAS', 'Becas', 2],
    ]);
    expect(grupos.every((g) => g.estado === null && g.personaId === null)).toBe(true);
  });

  it('por estado sigue el ciclo de vida, no el alfabeto', () => {
    const grupos = agruparBacklog(filas(documentoCompromisoEnItem()).filas, 'estado');
    expect(grupos.map((g) => g.estado)).toEqual(['iniciado', 'pendiente', 'done', 'cancelada']);
    expect(grupos.every((g) => g.nombre === null)).toBe(true);
  });

  it('por responsable ordena por carga descendente y deja «sin asignar» al final', () => {
    const grupos = agruparBacklog(filas(documentoCompromisoEnItem()).filas, 'responsable');
    expect(grupos.map((g) => [g.personaId, g.filas.length])).toEqual([
      ['ana-lopez', 2],
      ['jesus-castillo', 2],
      [null, 4],
    ]);
    expect(grupos.at(-1)?.nombre).toBeNull();
  });

  it('«sin asignar» va al final aunque sea el grupo más grande de todos', () => {
    // Cuatro sin dueño contra dos y dos: por tamaño iría primero, y es justo lo que no
    // debe pasar — es un hueco del documento, no una persona que compita.
    const grupos = agruparBacklog(filas(documentoCompromisoEnItem()).filas, 'responsable');
    expect(grupos.at(-1)?.personaId).toBeNull();
    expect(grupos.at(-1)?.filas.length).toBe(4);
    expect(Math.max(...grupos.map((g) => g.filas.length))).toBe(4);
  });

  it('cuando nadie tiene dueño hay un solo grupo, y es el nulo', () => {
    const base = documentoCompromisoEnItem();
    const doc = unDocumento({ ...base, sprints: [] });
    const grupos = agruparBacklog(filas(doc).filas, 'responsable');
    expect(grupos.map((g) => [g.personaId, g.nombre])).toEqual([[null, null]]);
  });

  it('una lista vacía no produce grupos vacíos', () => {
    for (const agrupacion of ['proyecto', 'responsable', 'estado'] as const) {
      expect(agruparBacklog([], agrupacion), agrupacion).toEqual([]);
    }
  });

  it('agrupar dos veces la misma lista da exactamente el mismo orden', () => {
    const { filas: lista } = filas(documentoCompromisoEnItem());
    for (const agrupacion of ['proyecto', 'responsable', 'estado'] as const) {
      const uno = agruparBacklog(lista, agrupacion).map((g) => g.id);
      const dos = agruparBacklog(lista, agrupacion).map((g) => g.id);
      expect(dos, agrupacion).toEqual(uno);
    }
  });
});

describe('el resto de la fila', () => {
  it('trae el bloqueo vigente y los días detenida', () => {
    const fila = filas(documentoCompromisoEnItem()).filas.find((f) => f.ubicacion.tarea.id === 'SICOE-T4');
    expect(fila?.bloqueo?.motivo).toBe('Esperando al proveedor');
    expect(fila?.diasDetenida).toBe(10);
  });

  it('lo que no está bloqueado lleva null en los dos campos, no 0 días', () => {
    const fila = filas(documentoCompromisoEnItem()).filas.find((f) => f.ubicacion.tarea.id === 'SICOE-T1');
    expect(fila?.bloqueo).toBeNull();
    expect(fila?.diasDetenida).toBeNull();
  });

  it('la procedencia solo se marca en lo emergente y abierto', () => {
    const lista = filas(documentoCompromisoEnItem()).filas;
    expect(lista.filter((f) => f.nuevo).map((f) => f.ubicacion.tarea.id)).toEqual(['SICOE-T4']);
  });

  it('enSprintActivo distingue lo comprometido de lo que no', () => {
    const lista = filas(documentoCompromisoEnItem()).filas;
    expect(lista.filter((f) => f.enSprintActivo).map((f) => f.ubicacion.tarea.id)).toEqual([
      'SICOE-T1',
      'SICOE-T2',
      'SICOE-T3',
      'SICOE-T5',
      'BECAS-T2',
    ]);
  });
});
