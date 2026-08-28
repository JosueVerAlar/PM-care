/**
 * Validación del documento.
 *
 * Dos frentes distintos y conviene no confundirlos:
 *
 * 1. Lo que Zod SÍ puede ver: forma, enums, referencias cruzadas, unicidad, contadores.
 * 2. Lo que Zod NO puede ver porque ocurre antes, en `JSON.parse`: el BOM y las claves
 *    duplicadas. Están aquí abajo, en su propio bloque, para que E3 (el almacén) sepa
 *    exactamente qué le toca atajar a él y no dé por hecho que el esquema lo cubre.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { documentoVacio, validarDocumento } from '../../src/compartido/modelo/esquema';
import { ESQUEMA_VERSION } from '../../src/compartido/modelo/version';
import {
  unBloqueo,
  unDocumento,
  unItem,
  unMiembro,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaPersona,
  unaTarea,
} from '../apoyo/constructores';

/** Los mensajes de todos los problemas, para afirmar sin depender del orden. */
function problemas(valor: unknown): string[] {
  const resultado = validarDocumento(valor);
  return resultado.ok ? [] : resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`);
}

function rutas(valor: unknown): string[] {
  const resultado = validarDocumento(valor);
  return resultado.ok ? [] : resultado.problemas.map((p) => p.ruta);
}

const CRUDO_EJEMPLO = readFileSync(new URL('../../datos/ejemplo.json', import.meta.url), 'utf8');

// --- lo que sí valida -------------------------------------------------------

describe('documentos válidos', () => {
  it('el documento vacío valida y declara la versión de esta build', () => {
    const resultado = validarDocumento(documentoVacio());
    expect(resultado.ok).toBe(true);
    expect(documentoVacio().esquema_version).toBe(ESQUEMA_VERSION);
  });

  it('datos/ejemplo.json valida sin un solo problema', () => {
    expect(problemas(JSON.parse(CRUDO_EJEMPLO))).toEqual([]);
  });

  it('una tarea escrita a mano con lo mínimo se completa con los valores por defecto', () => {
    const doc = {
      esquema_version: 1,
      proyectos: [
        {
          clave: 'PRUEBA',
          nombre: 'Proyecto',
          contadores: { epicas: 1, historias: 1, tareas: 1 },
          epicas: [
            {
              id: 'PRUEBA-E1',
              titulo: 'Épica',
              historias: [
                {
                  id: 'PRUEBA-H1',
                  titulo: 'Historia',
                  tareas: [{ id: 'PRUEBA-T1', titulo: 'Tarea', estado: 'pendiente' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const resultado = validarDocumento(doc);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const tarea = resultado.documento.proyectos[0]?.epicas[0]?.historias[0]?.tareas[0];
    expect(tarea).toMatchObject({ planeada: true, bloqueos: [], responsable: null, prioridad: null });
  });

  it('personas, proyectos y sprints ausentes se completan como listas vacías', () => {
    const resultado = validarDocumento({ esquema_version: 1 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.documento).toMatchObject({ personas: [], proyectos: [], sprints: [] });
  });
});

// --- regla 14: campos desconocidos ------------------------------------------

describe('regla 14: los campos desconocidos se conservan, nunca se borran ni tumban la app', () => {
  const conNotas = () =>
    unDocumento({
      nota_del_usuario: 'esto lo escribí yo',
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          mi_campo: 'del proyecto',
          epicas: [
            unaEpica({
              recordatorio: 'de la épica',
              historias: [
                unaHistoria({
                  pendiente_de: 'de la historia',
                  tareas: [unaTarea({ id: 'PRUEBA-T1', apunte: 'de la tarea' })],
                }),
              ],
            }),
          ],
        }),
      ],
      sprints: [unSprint({ id: 'S-1', retro: 'del sprint', items: [unItem('PRUEBA-T1', { comentario: 'del item' })] })],
    });

  it('un documento con campos desconocidos por todas partes valida igual', () => {
    expect(problemas(conNotas())).toEqual([]);
  });

  it('los campos desconocidos siguen ahí después de validar, en cada nivel', () => {
    const resultado = validarDocumento(conNotas());
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const doc = resultado.documento;
    const proyecto = doc.proyectos[0];
    const epica = proyecto?.epicas[0];
    const historia = epica?.historias[0];
    expect(doc['nota_del_usuario']).toBe('esto lo escribí yo');
    expect(proyecto?.['mi_campo']).toBe('del proyecto');
    expect(epica?.['recordatorio']).toBe('de la épica');
    expect(historia?.['pendiente_de']).toBe('de la historia');
    expect(historia?.tareas[0]?.['apunte']).toBe('de la tarea');
    expect(doc.sprints[0]?.['retro']).toBe('del sprint');
    expect(doc.sprints[0]?.items[0]?.['comentario']).toBe('del item');
  });

  it('reescribir el documento validado no se come las notas del usuario', () => {
    const resultado = validarDocumento(conNotas());
    if (!resultado.ok) throw new Error('debería validar');
    const reescrito: unknown = JSON.parse(JSON.stringify(resultado.documento));
    expect(problemas(reescrito)).toEqual([]);
    expect(JSON.stringify(reescrito)).toContain('esto lo escribí yo');
    expect(JSON.stringify(reescrito)).toContain('del item');
  });

  it('regla 1: el esquema NO puede rechazar un "estado" pegado a una épica — passthrough lo deja pasar', () => {
    // Consecuencia directa de la regla 14: `passthrough` y `strict` no caben juntos. La
    // regla 1 se protege con la prueba estructural de abajo, no con el validador.
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ estado: 'hecha', porcentaje: 100 })] })],
    });
    expect(problemas(doc)).toEqual([]);
  });

  it('regla 1: ningún contenedor del fixture persiste estado ni porcentaje (prueba estructural)', () => {
    const doc = JSON.parse(CRUDO_EJEMPLO) as Record<string, any>;
    const prohibidos = ['estado', 'porcentaje', 'pct', 'avance'];
    const revisar = (entidad: Record<string, unknown>, donde: string) => {
      for (const campo of prohibidos) {
        expect(Object.hasOwn(entidad, campo), `${donde} no debe persistir "${campo}"`).toBe(false);
      }
    };
    for (const proyecto of doc['proyectos'] ?? []) {
      revisar(proyecto, `proyecto ${proyecto.clave}`);
      for (const epica of proyecto.epicas ?? []) {
        revisar(epica, `épica ${epica.id}`);
        for (const historia of epica.historias ?? []) revisar(historia, `historia ${historia.id}`);
      }
    }
  });
});

// --- ids --------------------------------------------------------------------

describe('ids duplicados y mal prefijados', () => {
  it('dos tareas con el mismo id en el mismo proyecto se rechazan', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1' })] }),
                unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('id duplicado en el documento: PRUEBA-T1'));
  });

  it('el duplicado se señala con la ruta del segundo, no del primero', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              id: 'PRUEBA-E1',
              historias: [
                unaHistoria({ id: 'PRUEBA-H1', tareas: [unaTarea({ id: 'PRUEBA-T1' })] }),
                unaHistoria({ id: 'PRUEBA-H2', tareas: [unaTarea({ id: 'PRUEBA-T1' })] }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(rutas(doc)).toContain('proyectos[0].epicas[0].historias[1].tareas[0].id');
  });

  it('una épica y una historia no pueden compartir id aunque sean de tipos distintos', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          contadores: { epicas: 9, historias: 9, tareas: 9 },
          epicas: [unaEpica({ id: 'PRUEBA-E1', historias: [unaHistoria({ id: 'PRUEBA-E1' })] })],
        }),
      ],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('id duplicado'));
  });

  it('un id duplicado entre DOS proyectos distintos también se detecta', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ id: 'PRUEBA-E1' })] }),
        unProyecto({ clave: 'OTRO', epicas: [unaEpica({ id: 'PRUEBA-E1' })] }),
      ],
    });
    expect(problemas(doc).join('\n')).toContain('PRUEBA-E1');
  });

  it('un id con el prefijo de otro proyecto se rechaza: copiar y pegar entre proyectos rompe el historial', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'OTRO', epicas: [unaEpica({ id: 'SICOE-E1' })] })],
    });
    expect(problemas(doc)).toContainEqual(
      expect.stringContaining('"SICOE-E1" está dentro de OTRO pero su prefijo dice otro proyecto'),
    );
  });

  it('un id con formato inesperado se rechaza con la forma que se esperaba', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ id: 'epica-1' })] })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('id con formato inesperado'));
  });

  it('dos proyectos con la misma clave se rechazan', () => {
    const doc = unDocumento({ proyectos: [unProyecto({ clave: 'PRUEBA' }), unProyecto({ clave: 'PRUEBA' })] });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('clave de proyecto duplicada: PRUEBA'));
  });

  it('una clave de proyecto en minúsculas se rechaza: es el prefijo que el usuario busca con Cmd-F', () => {
    expect(problemas(unDocumento({ proyectos: [unProyecto({ clave: 'sicoe' })] }))).toContainEqual(
      expect.stringContaining('clave en mayúsculas'),
    );
  });

  it('regla 15: un contador por debajo de lo ya usado se rechaza antes de reciclar un id vivo', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          contadores: { epicas: 1, historias: 1, tareas: 108 },
          epicas: [
            unaEpica({
              id: 'PRUEBA-E1',
              historias: [unaHistoria({ id: 'PRUEBA-H1', tareas: [unaTarea({ id: 'PRUEBA-T500' })] })],
            }),
          ],
        }),
      ],
    });
    expect(problemas(doc)).toContainEqual(
      expect.stringContaining('contadores.tareas = 108 pero PRUEBA ya usa el número 500'),
    );
  });

  it('un contador por encima de lo usado es legítimo: hubo ids emitidos y borrados', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          contadores: { epicas: 9, historias: 9, tareas: 900 },
          epicas: [
            unaEpica({
              id: 'PRUEBA-E1',
              historias: [unaHistoria({ id: 'PRUEBA-H1', tareas: [unaTarea({ id: 'PRUEBA-T3' })] })],
            }),
          ],
        }),
      ],
    });
    expect(problemas(doc)).toEqual([]);
  });
});

// --- personas y equipos -----------------------------------------------------

describe('personas, equipos y responsables', () => {
  it('dos personas con el mismo id se rechazan', () => {
    const doc = unDocumento({ personas: [unaPersona({ id: 'ana' }), unaPersona({ id: 'ana' })] });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('persona duplicada: ana'));
  });

  it('un id de persona en mayúsculas o con espacios se rechaza', () => {
    expect(problemas(unDocumento({ personas: [unaPersona({ id: 'Ana Garcia' })] }))).toContainEqual(
      expect.stringContaining('id de persona en minúsculas'),
    );
  });

  it('un responsable que no está en personas se rechaza', () => {
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana' })],
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ responsable: 'fantasma' })] })] })],
        }),
      ],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('responsable "fantasma" no está en personas'));
  });

  it('un responsable nulo es válido: hay tareas sin dueño', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ responsable: null })] })] })],
        }),
      ],
    });
    expect(problemas(doc)).toEqual([]);
  });

  it('un miembro de equipo que no existe se rechaza', () => {
    const doc = unDocumento({ proyectos: [unProyecto({ clave: 'PRUEBA', equipo: [unMiembro('fantasma')] })] });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('no está en personas'));
  });

  it('la misma persona dos veces en el equipo se rechaza', () => {
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana' })],
      proyectos: [unProyecto({ clave: 'PRUEBA', equipo: [unMiembro('ana', 'backend'), unMiembro('ana', 'vistas')] })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('"ana" aparece dos veces en el equipo'));
  });
});

// --- sprints ----------------------------------------------------------------

describe('sprints', () => {
  const conTarea = () =>
    unProyecto({
      clave: 'PRUEBA',
      epicas: [unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ id: 'PRUEBA-T1' })] })] })],
    });

  it('un item que apunta a una tarea inexistente se rechaza', () => {
    const doc = unDocumento({
      proyectos: [conTarea()],
      sprints: [unSprint({ id: 'S-1', items: [unItem('PRUEBA-T404')] })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('la tarea "PRUEBA-T404" no existe'));
  });

  it('la misma tarea dos veces en el mismo sprint se rechaza', () => {
    const doc = unDocumento({
      proyectos: [conTarea()],
      sprints: [unSprint({ id: 'S-1', items: [unItem('PRUEBA-T1'), unItem('PRUEBA-T1')] })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('está dos veces en el mismo sprint'));
  });

  it('la misma tarea en dos sprints distintos es legítima: así se deriva "arrastrada"', () => {
    const doc = unDocumento({
      proyectos: [conTarea()],
      sprints: [
        unSprint({ id: 'S-1', estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14', items: [unItem('PRUEBA-T1')] }),
        unSprint({ id: 'S-2', estado: 'activo', items: [unItem('PRUEBA-T1')] }),
      ],
    });
    expect(problemas(doc)).toEqual([]);
  });

  it('dos sprints activos se rechazan: "el sprint activo" es singular en toda la interfaz', () => {
    const doc = unDocumento({
      sprints: [unSprint({ id: 'S-1', estado: 'activo' }), unSprint({ id: 'S-2', estado: 'activo' })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('hay 2 sprints con estado "activo"'));
  });

  it('dos sprints con el mismo id se rechazan', () => {
    const doc = unDocumento({
      sprints: [unSprint({ id: 'S-1', estado: 'cerrado' }), unSprint({ id: 'S-1', estado: 'planeado' })],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('sprint duplicado: S-1'));
  });

  it('un sprint que termina antes de empezar se rechaza', () => {
    const doc = unDocumento({ sprints: [unSprint({ id: 'S-1', inicio: '2026-08-30', fin: '2026-08-24' })] });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('es anterior al inicio'));
  });

  it('un sprint de un solo día es válido: fin igual a inicio no es un error', () => {
    const doc = unDocumento({ sprints: [unSprint({ id: 'S-1', inicio: '2026-08-24', fin: '2026-08-24' })] });
    expect(problemas(doc)).toEqual([]);
  });
});

// --- bloqueos y enums -------------------------------------------------------

describe('bloqueos y enums', () => {
  it('dos bloqueos abiertos a la vez se rechazan: no se sabría cuál se cierra al desbloquear', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({
                  tareas: [unaTarea({ id: 'PRUEBA-T1', bloqueos: [unBloqueo(), unBloqueo({ motivo: 'otro' })] })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('hay 2 bloqueos abiertos a la vez'));
  });

  it('uno cerrado y uno abierto es la secuencia normal y valida', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({
              historias: [
                unaHistoria({
                  tareas: [
                    unaTarea({
                      id: 'PRUEBA-T1',
                      bloqueos: [unBloqueo({ desbloqueada_en: '2026-08-01T09:00:00-06:00' }), unBloqueo()],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    expect(problemas(doc)).toEqual([]);
  });

  it('"bloqueada" no es un estado de tarea: se rechaza', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'PRUEBA',
          epicas: [
            unaEpica({ historias: [unaHistoria({ tareas: [unaTarea({ estado: 'bloqueada' as never })] })] }),
          ],
        }),
      ],
    });
    expect(validarDocumento(doc).ok).toBe(false);
  });

  it('una fecha que no es YYYY-MM-DD se rechaza', () => {
    const doc = unDocumento({ sprints: [unSprint({ id: 'S-1', inicio: '24/08/2026' })] });
    expect(problemas(doc)).toContainEqual(expect.stringContaining('se espera una fecha YYYY-MM-DD'));
  });

  it('un título vacío se rechaza: no se puede adivinar', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ titulo: '' })] })],
    });
    expect(validarDocumento(doc).ok).toBe(false);
  });

  it('un título con acentos, emoji y 200 caracteres es válido: el usuario escribe lo que quiere', () => {
    const largo = `Regularización — ñandú 🚧 ${'x'.repeat(170)}`;
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ titulo: largo })] })],
    });
    expect(problemas(doc)).toEqual([]);
  });
});

// --- versión y forma de la raíz ---------------------------------------------

describe('la raíz', () => {
  it('sin esquema_version no valida', () => {
    expect(validarDocumento({ proyectos: [] }).ok).toBe(false);
  });

  it('una versión no entera no valida', () => {
    expect(validarDocumento({ esquema_version: 1.5 }).ok).toBe(false);
  });

  it('null y una cadena no son documentos', () => {
    expect(validarDocumento(null).ok).toBe(false);
    expect(validarDocumento('{}').ok).toBe(false);
    expect(validarDocumento([]).ok).toBe(false);
  });

  it('la ruta de un problema en la raíz se lee "(raíz)", no una cadena vacía', () => {
    const doc = unDocumento({
      sprints: [unSprint({ id: 'S-1', estado: 'activo' }), unSprint({ id: 'S-2', estado: 'activo' })],
    });
    expect(rutas(doc)).toContain('sprints');
    expect(validarDocumento(42).ok).toBe(false);
    expect(rutas(42)).toContain('(raíz)');
  });

  it('devuelve TODOS los problemas, no solo el primero: la pantalla de solo lectura los lista', () => {
    const doc = unDocumento({
      personas: [unaPersona({ id: 'ana' }), unaPersona({ id: 'ana' })],
      proyectos: [unProyecto({ clave: 'PRUEBA' }), unProyecto({ clave: 'PRUEBA' })],
      sprints: [unSprint({ id: 'S-1', estado: 'activo' }), unSprint({ id: 'S-2', estado: 'activo' })],
    });
    expect(problemas(doc).length).toBeGreaterThanOrEqual(3);
  });

  it('las rutas son legibles dentro del JSON: proyectos[0].epicas[0].id', () => {
    const doc = unDocumento({
      proyectos: [unProyecto({ clave: 'PRUEBA', epicas: [unaEpica({ id: 'mal' })] })],
    });
    expect(rutas(doc)).toContain('proyectos[0].epicas[0].id');
  });

  it('validarDocumento no lanza nunca, ni con basura', () => {
    for (const basura of [undefined, null, 0, '', [], { esquema_version: 'uno' }, { esquema_version: 1, proyectos: 'no' }]) {
      expect(() => validarDocumento(basura)).not.toThrow();
    }
  });
});

// --- lo que ocurre ANTES del esquema: JSON.parse -----------------------------

describe('lo que el esquema NO puede ver porque pasa en JSON.parse (tarea de E3)', () => {
  it('un JSON con BOM revienta en JSON.parse antes de llegar al esquema', () => {
    const conBOM = `﻿${CRUDO_EJEMPLO}`;
    expect(() => JSON.parse(conBOM)).toThrow(SyntaxError);
  });

  it('quitando el BOM, el mismo contenido valida: el BOM es lo único que estorba', () => {
    const conBOM = `﻿${CRUDO_EJEMPLO}`;
    expect(problemas(JSON.parse(conBOM.replace(/^﻿/, '')))).toEqual([]);
  });

  it('el BOM sobrevive a readFileSync con utf8: hay que quitarlo a mano', () => {
    // Node no lo elimina solo. Es exactamente el caso "el usuario guardó el archivo con
    // otro editor" y por eso E3 tiene que decidir: quitarlo o abrir en solo lectura.
    expect(`﻿{}`.charCodeAt(0)).toBe(0xfeff);
    expect(`﻿{}`.replace(/^﻿/, '')).toBe('{}');
  });

  it('las claves duplicadas NO dan error: gana la última y el esquema ya no puede notarlo', () => {
    const crudo = '{"esquema_version": 1, "proyectos": [], "proyectos": [{"clave":"X"}]}';
    const parseado = JSON.parse(crudo) as { proyectos: unknown[] };
    expect(parseado.proyectos).toHaveLength(1);
    // Para el validador este documento es indistinguible de uno escrito una sola vez, así
    // que detectar el duplicado exige mirar el TEXTO, no el objeto. Le toca a E3.
    expect(validarDocumento({ esquema_version: 1, proyectos: [] }).ok).toBe(true);
  });

  it('una clave duplicada dentro de una tarea también se pierde en silencio', () => {
    const crudo = '{"id":"PRUEBA-T1","estado":"pendiente","estado":"hecha"}';
    expect((JSON.parse(crudo) as { estado: string }).estado).toBe('hecha');
  });

  it('un JSON truncado revienta en JSON.parse: es el caso de "se cortó la escritura"', () => {
    expect(() => JSON.parse(CRUDO_EJEMPLO.slice(0, 500))).toThrow(SyntaxError);
  });
});

/**
 * N9 · la jerarquía es opcional por diseño.
 *
 * «Infraestructura» y «DGETI web» son trabajo continuo sin épicas. Obligarlas a una épica
 * «General» inventada sería mentirle a la estructura para que quepa en el modelo, así que
 * una tarea puede colgar de una historia, de una épica o del propio proyecto.
 */
describe('N9 · tareas sin jerarquía completa', () => {
  /** Un proyecto de trabajo continuo: sin una sola épica, con tareas sueltas. */
  const continuo = () =>
    unDocumento({
      proyectos: [
        unProyecto({
          clave: 'INFRA',
          epicas: [],
          tareas: [unaTarea({ clave: 'INFRA' }), unaTarea({ clave: 'INFRA' })],
        }),
      ],
    });

  it('un proyecto sin épicas y con tareas colgadas valida', () => {
    const resultado = validarDocumento(continuo());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });

  it('una épica puede llevar tareas sin historia de por medio', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'INFRA',
          epicas: [unaEpica({ clave: 'INFRA', tareas: [unaTarea({ clave: 'INFRA' })] })],
        }),
      ],
    });
    const resultado = validarDocumento(doc);
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });

  /**
   * El riesgo silencioso del cambio: si la verificación de contadores no mirara las tres
   * listas, un id escrito a mano en la lista nueva no levantaría la alarma y la app
   * volvería a emitir ese número — dos tareas vivas con el mismo id (regla 15).
   */
  it('un id alto en una tarea suelta SÍ obliga a subir el contador', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'INFRA',
          epicas: [],
          tareas: [unaTarea({ clave: 'INFRA', id: 'INFRA-T500' })],
          contadores: { epicas: 0, historias: 0, tareas: 3 },
        }),
      ],
    });
    const resultado = validarDocumento(doc);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas.map((p) => p.mensaje).join(' ')).toContain('500');
    }
  });

  it('un id duplicado entre dos listas distintas se detecta igual', () => {
    const doc = unDocumento({
      proyectos: [
        unProyecto({
          clave: 'INFRA',
          epicas: [
            unaEpica({
              clave: 'INFRA',
              tareas: [unaTarea({ clave: 'INFRA', id: 'INFRA-T1' })],
            }),
          ],
          tareas: [unaTarea({ clave: 'INFRA', id: 'INFRA-T1' })],
          contadores: { epicas: 1, historias: 0, tareas: 1 },
        }),
      ],
    });
    const resultado = validarDocumento(doc);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.problemas.map((p) => p.mensaje).join(' ')).toContain('duplicado');
    }
  });
});
