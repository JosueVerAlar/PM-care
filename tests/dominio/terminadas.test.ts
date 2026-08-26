/**
 * Vista global de Terminadas.
 *
 * El registro se lee del DESENLACE CONGELADO del item, no del árbol vivo: es lo único que
 * hace que «lo que cerramos en julio» siga diciendo lo mismo en septiembre (regla 8). Y
 * `textoDeTerminadas` es lo que el usuario pega en un correo, así que su formato se
 * congela aquí carácter por carácter.
 */

import { describe, expect, it } from 'vitest';

import {
  encabezadoDeSprint,
  registroDeTerminadas,
  terminadasFueraDeSprint,
  textoDeTerminadas,
  type ProyectoTerminadas,
} from '../../src/compartido/dominio/terminadas';
import { paraVistaTerminadas } from '../../src/compartido/dominio/clasificar';
import { validarDocumento } from '../../src/compartido/modelo/esquema';
import type { Documento, Instante, Sprint, Tarea } from '../../src/compartido/modelo/tipos';
import {
  unDocumento,
  unItem,
  unProyecto,
  unSprint,
  unaEpica,
  unaHistoria,
  unaTarea,
} from '../apoyo/constructores';

function proyectoCon(clave: string, nombre: string, tareas: Tarea[]) {
  return unProyecto({
    clave,
    nombre,
    epicas: [unaEpica({ clave, historias: [unaHistoria({ clave, tareas })] })],
  });
}

/** El formateador del borde de presentación, aquí reducido a la parte de calendario. */
const soloFecha = (instante: Instante) => instante.slice(0, 10);

/**
 * Dos sprints cerrados y uno activo.
 *
 * `ALFA-T2` es la pieza del caso pedido: quedó `completada` en S1 y HOY está `pendiente`
 * porque alguien la reabrió. Tiene que seguir contando en S1.
 */
function documentoTerminadas(): Documento {
  const migrar = unaTarea({
    id: 'ALFA-T1',
    clave: 'ALFA',
    titulo: 'Migrar el padrón',
    estado: 'hecha',
    hecha_en: '2026-07-08T18:00:00-06:00',
  });
  const reabierta = unaTarea({
    id: 'ALFA-T2',
    clave: 'ALFA',
    titulo: 'Regularización de grupos',
    estado: 'pendiente',
    hecha_en: null,
  });
  const deJulio = unaTarea({
    id: 'ALFA-T3',
    clave: 'ALFA',
    titulo: 'Actas de evaluación',
    estado: 'hecha',
    hecha_en: '2026-07-20T18:00:00-06:00',
  });
  const nuncaEnSprint = unaTarea({
    id: 'ALFA-T4',
    clave: 'ALFA',
    titulo: 'Capturada ya hecha',
    estado: 'hecha',
    hecha_en: '2026-08-01T18:00:00-06:00',
  });
  const enElActivo = unaTarea({
    id: 'ALFA-T5',
    clave: 'ALFA',
    titulo: 'Cerrada en el sprint que corre',
    estado: 'hecha',
    hecha_en: '2026-08-25T18:00:00-06:00',
  });
  const beta1 = unaTarea({
    id: 'BETA-T1',
    clave: 'BETA',
    titulo: 'Tablero de indicadores',
    estado: 'hecha',
    hecha_en: '2026-07-10T18:00:00-06:00',
  });
  const beta2 = unaTarea({
    id: 'BETA-T2',
    clave: 'BETA',
    titulo: 'Respaldos automáticos',
    estado: 'pendiente',
  });

  const s1 = unSprint({
    id: 'S-1',
    nombre: 'Sprint 27',
    inicio: '2026-07-01',
    fin: '2026-07-14',
    estado: 'cerrado',
    items: [
      unItem('ALFA-T1', { desenlace: 'completada' }),
      unItem('BETA-T1', { desenlace: 'completada' }),
      unItem('ALFA-T2', { desenlace: 'completada' }),
      unItem('BETA-T2', { desenlace: 'arrastrada' }),
    ],
  });
  const s2 = unSprint({
    id: 'S-2',
    nombre: 'Sprint 28',
    inicio: '2026-07-15',
    fin: '2026-07-28',
    estado: 'cerrado',
    items: [unItem('ALFA-T3', { desenlace: 'completada' })],
  });
  const activo = unSprint({
    id: 'S-3',
    nombre: 'Sprint 29',
    inicio: '2026-08-24',
    fin: '2026-09-04',
    estado: 'activo',
    items: [unItem('ALFA-T5')],
  });

  return unDocumento({
    proyectos: [
      proyectoCon('ALFA', 'Alfa', [migrar, reabierta, deJulio, nuncaEnSprint, enElActivo]),
      proyectoCon('BETA', 'Beta', [beta1, beta2]),
    ],
    // A propósito desordenados: el módulo tiene que ordenarlos, no confiar en el archivo.
    sprints: [s2, activo, s1],
  });
}

describe('el documento de prueba es válido: si no, las pruebas medirían un documento imposible', () => {
  it('valida contra el esquema', () => {
    const resultado = validarDocumento(documentoTerminadas());
    expect(resultado.ok ? [] : resultado.problemas).toEqual([]);
  });
});

describe('registroDeTerminadas', () => {
  it('un documento sin sprints cerrados da registro vacío, no un sprint inventado', () => {
    expect(registroDeTerminadas(unDocumento())).toEqual([]);
  });

  it('va del sprint más reciente al más viejo aunque el documento los guarde al revés', () => {
    expect(registroDeTerminadas(documentoTerminadas()).map((r) => r.sprint.id)).toEqual(['S-2', 'S-1']);
  });

  it('el sprint activo no entra: el registro es de lo cerrado', () => {
    expect(registroDeTerminadas(documentoTerminadas()).map((r) => r.sprint.id)).not.toContain('S-3');
  });

  it('cuenta solo los items con desenlace "completada"', () => {
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    expect(s1?.total).toBe(3);
    expect(s1?.noCompletadas).toBe(1);
  });

  it('una tarea completada en un sprint cerrado y REABIERTA después sigue contando en ese sprint', () => {
    // El caso que da sentido a la vista: si se leyera `tarea.estado === "hecha"`, reabrir
    // hoy ALFA-T2 borraría una de las tres que se cerraron en julio.
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    const ids = s1?.porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id));
    expect(ids).toContain('ALFA-T2');
    expect(s1?.total).toBe(3);
  });

  it('la fila reabierta se marca en vez de enseñar un glifo de hecha que hoy es falso', () => {
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    const marcas = s1?.porProyecto.flatMap((p) =>
      p.tareas.map((t) => [t.ubicacion.tarea.id, t.reabierta] as const),
    );
    expect(marcas).toEqual([
      ['ALFA-T1', false],
      ['ALFA-T2', true],
      ['BETA-T1', false],
    ]);
  });

  it('una completada que hoy está CANCELADA también se marca como reabierta: ya no está hecha', () => {
    const doc = documentoTerminadas();
    const conCancelada = unDocumento({
      ...doc,
      proyectos: [
        proyectoCon('ALFA', 'Alfa', [
          unaTarea({ id: 'ALFA-T1', clave: 'ALFA', titulo: 'Migrar el padrón', estado: 'cancelada' }),
        ]),
      ],
      sprints: [
        unSprint({
          id: 'S-1',
          nombre: 'Sprint 27',
          inicio: '2026-07-01',
          fin: '2026-07-14',
          estado: 'cerrado',
          items: [unItem('ALFA-T1', { desenlace: 'completada' })],
        }),
      ],
    });
    const s1 = registroDeTerminadas(conCancelada)[0];
    expect(s1?.total).toBe(1);
    expect(s1?.porProyecto[0]?.tareas[0]?.reabierta).toBe(true);
  });

  it('agrupa por proyecto sin partir un grupo aunque los items vengan intercalados', () => {
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    expect(s1?.porProyecto.map((p) => [p.clave, p.tareas.length])).toEqual([
      ['ALFA', 2],
      ['BETA', 1],
    ]);
  });

  it('el total de un sprint es la suma de sus proyectos', () => {
    for (const registro of registroDeTerminadas(documentoTerminadas())) {
      const suma = registro.porProyecto.reduce((acc, p) => acc + p.tareas.length, 0);
      expect(suma, registro.sprint.id).toBe(registro.total);
    }
  });

  it('trae la fecha en que se dio por hecha, y null cuando el documento no la tiene', () => {
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    const fechas = s1?.porProyecto.flatMap((p) => p.tareas.map((t) => t.hechaEn));
    expect(fechas).toEqual(['2026-07-08T18:00:00-06:00', null, '2026-07-10T18:00:00-06:00']);
  });

  it('un sprint cerrado sin ningún desenlace se incluye con total 0: esconderlo dejaría un hueco', () => {
    const doc = unDocumento({
      proyectos: [proyectoCon('ALFA', 'Alfa', [unaTarea({ id: 'ALFA-T1', clave: 'ALFA' })])],
      sprints: [
        unSprint({ id: 'S-V', nombre: 'Sprint vacío', estado: 'cerrado', inicio: '2026-07-01', fin: '2026-07-14', items: [] }),
      ],
    });
    expect(registroDeTerminadas(doc)).toHaveLength(1);
    expect(registroDeTerminadas(doc)[0]).toMatchObject({ total: 0, noCompletadas: 0, porProyecto: [] });
  });
});

describe('terminadasFueraDeSprint: la reconciliación entre el avance y el registro', () => {
  it('nombra las hechas que no pasaron por ningún sprint cerrado', () => {
    const fuera = terminadasFueraDeSprint(documentoTerminadas());
    expect(fuera.total).toBe(2);
    expect(fuera.porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id))).toEqual([
      'ALFA-T4',
      'ALFA-T5',
    ]);
  });

  it('una hecha comprometida en el sprint ACTIVO todavía cuenta como fuera: aún no se cerró nada', () => {
    expect(
      terminadasFueraDeSprint(documentoTerminadas())
        .porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id)),
    ).toContain('ALFA-T5');
  });

  it('la reabierta no aparece como suelta: no está hecha hoy', () => {
    const ids = terminadasFueraDeSprint(documentoTerminadas())
      .porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id));
    expect(ids).not.toContain('ALFA-T2');
  });

  it('nunca marca reabierta: una suelta es una hecha de hoy, sin desenlace que contradecir', () => {
    const fuera = terminadasFueraDeSprint(documentoTerminadas());
    expect(fuera.porProyecto.flatMap((p) => p.tareas.map((t) => t.reabierta))).toEqual([false, false]);
  });

  it('las dos cifras cuadran: toda hecha de hoy está registrada o está en la lista de sueltas', () => {
    const doc = documentoTerminadas();
    const registradas = new Set(
      registroDeTerminadas(doc).flatMap((r) =>
        r.porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id)),
      ),
    );
    const sueltas = new Set(
      terminadasFueraDeSprint(doc).porProyecto.flatMap((p) => p.tareas.map((t) => t.ubicacion.tarea.id)),
    );
    for (const ubicacion of paraVistaTerminadas(doc)) {
      const id = ubicacion.tarea.id;
      expect(registradas.has(id) || sueltas.has(id), id).toBe(true);
      expect(registradas.has(id) && sueltas.has(id), id).toBe(false);
    }
  });

  it('sin nada hecho la lista es vacía y el total 0, no null', () => {
    expect(terminadasFueraDeSprint(unDocumento())).toEqual({ total: 0, porProyecto: [] });
  });
});

describe('encabezadoDeSprint', () => {
  it('lleva nombre, rango y conteo', () => {
    const s2 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-2');
    expect(s2 && encabezadoDeSprint(s2)).toBe('Sprint 28 · 2026-07-15 a 2026-07-28 · 1 terminada');
  });

  it('el conteo va en singular con una y en plural con el resto, incluido el cero', () => {
    const con = (total: number) =>
      encabezadoDeSprint({
        sprint: unSprint({ id: 'S-X', nombre: 'Sprint X', inicio: '2026-07-01', fin: '2026-07-14', estado: 'cerrado' }),
        total,
        porProyecto: [],
        noCompletadas: 0,
      });
    expect(con(0)).toContain('0 terminadas');
    expect(con(1)).toContain('1 terminada');
    expect(con(5)).toContain('5 terminadas');
  });

  it('un sprint sin nombre no revienta: sale el rango y el conteo', () => {
    const sprint: Sprint = {
      ...unSprint({ id: 'S-Y', inicio: '2026-07-01', fin: '2026-07-14', estado: 'cerrado' }),
      nombre: '',
    };
    expect(encabezadoDeSprint({ sprint, total: 2, porProyecto: [], noCompletadas: 0 })).toBe(
      ' · 2026-07-01 a 2026-07-14 · 2 terminadas',
    );
  });
});

describe('textoDeTerminadas: el formato que se pega en un correo', () => {
  it('queda congelado carácter por carácter', () => {
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    if (!s1) throw new Error('el fixture debería traer S-1');
    expect(textoDeTerminadas(encabezadoDeSprint(s1), s1.porProyecto, soloFecha)).toBe(
      [
        'Sprint 27 · 2026-07-01 a 2026-07-14 · 3 terminadas',
        '',
        'Alfa (2)',
        '  · ALFA-T1 — Migrar el padrón (2026-07-08)',
        '  · ALFA-T2 — Regularización de grupos (sin fecha)',
        '',
        'Beta (1)',
        '  · BETA-T1 — Tablero de indicadores (2026-07-10)',
      ].join('\n'),
    );
  });

  it('sin proyectos devuelve solo el encabezado, sin salto de línea colgando', () => {
    expect(textoDeTerminadas('Sprint 27 · nada', [], soloFecha)).toBe('Sprint 27 · nada');
  });

  it('un proyecto sin tareas sale con su (0) y sin filas: no revienta ni se lo salta', () => {
    const vacio: ProyectoTerminadas = { clave: 'ALFA', nombre: 'Alfa', tareas: [] };
    expect(textoDeTerminadas('Encabezado', [vacio], soloFecha)).toBe('Encabezado\n\nAlfa (0)');
  });

  it('una tarea sin fecha dice «sin fecha» y no llama al formateador', () => {
    // Si lo llamara con null, `Intl` devolvería "Invalid Date" en el correo del usuario.
    const llamadas: Instante[] = [];
    const formatear = (instante: Instante) => {
      llamadas.push(instante);
      return 'X';
    };
    const s1 = registroDeTerminadas(documentoTerminadas()).find((r) => r.sprint.id === 'S-1');
    const texto = textoDeTerminadas('E', s1?.porProyecto ?? [], formatear);
    expect(texto).toContain('(sin fecha)');
    expect(llamadas).toEqual(['2026-07-08T18:00:00-06:00', '2026-07-10T18:00:00-06:00']);
  });

  it('el texto lleva una línea por tarea y el conteo del encabezado de cada proyecto cuadra', () => {
    const doc = documentoTerminadas();
    for (const registro of registroDeTerminadas(doc)) {
      const texto = textoDeTerminadas(encabezadoDeSprint(registro), registro.porProyecto, soloFecha);
      const filas = texto.split('\n').filter((linea) => linea.startsWith('  · '));
      expect(filas, registro.sprint.id).toHaveLength(registro.total);
      for (const proyecto of registro.porProyecto) {
        expect(texto, proyecto.clave).toContain(`${proyecto.nombre} (${proyecto.tareas.length})`);
      }
    }
  });

  it('el texto de las sueltas usa el mismo formato de filas', () => {
    const fuera = terminadasFueraDeSprint(documentoTerminadas());
    expect(textoDeTerminadas('Terminadas fuera de sprint (2)', fuera.porProyecto, soloFecha)).toBe(
      [
        'Terminadas fuera de sprint (2)',
        '',
        'Alfa (2)',
        '  · ALFA-T4 — Capturada ya hecha (2026-08-01)',
        '  · ALFA-T5 — Cerrada en el sprint que corre (2026-08-25)',
      ].join('\n'),
    );
  });
});
