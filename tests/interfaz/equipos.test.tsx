// @vitest-environment jsdom
/**
 * La pantalla de Equipos y la ficha de persona, montadas en un DOM (M6, decisión N11).
 *
 * `tests/comandos/equipos.test.ts` dice qué hace el reductor con cada comando; esto dice
 * qué comando manda la pantalla, que no es lo mismo y es donde M6 se podía romper en
 * silencio: los dos defectos que esta suite existe para que no vuelvan **compilaban**.
 *
 * 1. **`editarEquipo` sobre el equipo equivocado.** Antes de M6 el comando llevaba
 *    `{proyecto, miembros}` y escribía sobre `equipos[0]`. Con dos equipos por proyecto,
 *    una vista que mande el `equipoId` del primero pinta bien y guarda mal. Por eso casi
 *    todo lo que se edita aquí se edita sobre el SEGUNDO equipo: con uno solo, la
 *    implementación correcta y la equivocada dan el mismo resultado.
 * 2. **Una clave de proyecto en un campo que espera ids de equipo.** `crearPersona.equipos`
 *    sigue siendo `string[]`, así que mandar «PM» compila y revienta al usarlo con un «no
 *    existe el equipo "PM"». El tipo no lo puede ver; esta prueba sí.
 *
 * Los documentos se construyen con el reductor de verdad, no a mano: así lo que la vista
 * recibe es exactamente lo que el proceso principal produce, y un cambio en el reductor
 * que la vista no soporte sale aquí en vez de en producción.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EsquemaEquipo } from '../../src/compartido/modelo/esquema';
import type { Documento } from '../../src/compartido/modelo/tipos';
import { ProveedorInterfaz, useInterfaz } from '../../src/renderer/estado/interfaz';
import { SeccionEquipos } from '../../src/renderer/vistas/administracion/SeccionEquipos';
import { SeccionPersonas } from '../../src/renderer/vistas/administracion/SeccionPersonas';
import {
  FORMA_ID_EQUIPO,
  idEquipoSugerido,
  problemaDeIdEquipo,
} from '../../src/renderer/vistas/administracion/id-equipo';
import { aplicarTodos, arbolConEquipo, arbolConTareas } from '../apoyo/comandos';

const dobles = vi.hoisted(() => ({ mutar: vi.fn(), soloLectura: false }));
vi.mock('../../src/renderer/estado/mutaciones', () => ({
  useMutar: () => dobles.mutar,
  useSoloLectura: () => dobles.soloLectura,
}));

afterEach(cleanup);
beforeEach(() => {
  dobles.mutar.mockReset();
  dobles.mutar.mockResolvedValue(true);
  dobles.soloLectura = false;
});

/**
 * Un proyecto con DOS equipos y una persona en cada uno, más dos tareas asignadas a uno de
 * ellos. Es la forma mínima que distingue «toca el equipo correcto» de «toca el primero».
 *
 * Ana lleva un campo que el esquema no conoce (`nota`): es `passthrough` y el usuario
 * edita el JSON a mano (regla 14). Reenviar la lista reconstruyendo cada miembro con los
 * campos que la pantalla conoce se lo borraría en silencio, que es lo peor que puede pasar.
 */
function dosEquipos(): Documento {
  return aplicarTodos(arbolConTareas(3).doc, [
    { comando: 'crearPersona', nombre: 'Ana García' },
    { comando: 'crearPersona', nombre: 'Beto Ruiz' },
    { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' },
    { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-backend', nombre: 'Backend' },
    {
      comando: 'editarEquipo',
      equipoId: 'pm-frontend',
      miembros: [
        { persona_id: 'ana-garcia', responsabilidades: ['vistas'], capacidad: 8, nota: 'media jornada' },
      ],
    },
    {
      comando: 'editarEquipo',
      equipoId: 'pm-backend',
      miembros: [{ persona_id: 'beto-ruiz', responsabilidades: [], capacidad: null }],
    },
    { comando: 'asignarEquipo', tareaId: 'PM-T1', equipoId: 'pm-backend' },
    { comando: 'asignarEquipo', tareaId: 'PM-T2', equipoId: 'pm-backend' },
  ]);
}

/** Dos proyectos y la MISMA persona en un equipo de cada uno. */
function dosProyectos(): Documento {
  return aplicarTodos(dosEquipos(), [
    { comando: 'crearProyecto', clave: 'SIBE', nombre: 'Sistema de becas' },
    { comando: 'crearEquipo', proyecto: 'SIBE', id: 'sibe-datos', nombre: 'Datos' },
    {
      comando: 'editarEquipo',
      equipoId: 'sibe-datos',
      miembros: [{ persona_id: 'ana-garcia', responsabilidades: ['modelo'], capacidad: null }],
    },
  ]);
}

/**
 * La franja de aviso de la app vive en el armazón, no en la sección. Aquí se monta una
 * sonda equivalente —el mismo `aviso` del estado de interfaz— porque «no se traga el
 * cambio en silencio» solo se puede afirmar si se puede leer lo que se dijo.
 */
function FranjaAviso() {
  const { aviso } = useInterfaz();
  return aviso === null ? null : <p role="status">{aviso}</p>;
}

function montarEquipos(documento: Documento) {
  return render(
    <ProveedorInterfaz>
      <FranjaAviso />
      <SeccionEquipos documento={documento} />
    </ProveedorInterfaz>,
  );
}

function montarPersonas(documento: Documento) {
  return render(
    <ProveedorInterfaz>
      <SeccionPersonas documento={documento} />
    </ProveedorInterfaz>,
  );
}

/** La tarjeta de un equipo, por su nombre accesible. */
function tarjeta(nombre: string) {
  return within(screen.getByRole('region', { name: `Equipo ${nombre}` }));
}

// --- el id que teclea el usuario --------------------------------------------

describe('el id de equipo se pide, no se inventa (S5)', () => {
  it('se propone desde la clave y el nombre, sin acentos', () => {
    expect(idEquipoSugerido('PM', 'Frontend')).toBe('pm-frontend');
    expect(idEquipoSugerido('SIBE', 'Diseño y UX')).toBe('sibe-diseno-y-ux');
  });

  /** Un id que aparece solo con la clave («pm-») se acepta sin mirarlo. */
  it('sin nombre no propone nada', () => {
    expect(idEquipoSugerido('PM', '')).toBe('');
    expect(idEquipoSugerido('PM', '   ')).toBe('');
  });

  /**
   * La que de verdad importa: el campo y el documento tienen que aceptar exactamente lo
   * mismo. Si divergieran, la pantalla dejaría crear algo que el esquema rechaza —o
   * bloquearía algo legal— y el usuario no tendría cómo saber cuál de los dos manda.
   */
  it('acepta y rechaza lo mismo que el esquema del documento', () => {
    const casos = ['pm-frontend', 'a', 'pm-2', 'PM-frontend', 'pm_frontend', 'pm frontend', '-pm', 'pm-', ''];
    for (const caso of casos) {
      const segunElEsquema = EsquemaEquipo.shape.id.safeParse(caso).success;
      const segunElCampo = problemaDeIdEquipo(caso, new Map()) === null;
      expect(segunElCampo, caso).toBe(segunElEsquema);
    }
  });

  it('un id mal formado explica la forma en vez de citar el patrón', () => {
    expect(problemaDeIdEquipo('PM Frontend', new Map())).toBe(FORMA_ID_EQUIPO);
  });

  /** Nombrar el choque es la mitad del mensaje: sin eso hay que buscar a mano dónde está. */
  it('un id ocupado nombra quién lo tiene', () => {
    const ocupados = new Map([['pm-frontend', '"Frontend" de PM']]);
    expect(problemaDeIdEquipo('pm-frontend', ocupados)).toBe(
      'Ya existe un equipo con el id «pm-frontend»: "Frontend" de PM.',
    );
  });
});

// --- la pantalla ------------------------------------------------------------

describe('proyecto → equipos → miembros', () => {
  it('un proyecto con dos equipos pinta los dos, cada uno con SUS miembros', () => {
    montarEquipos(dosEquipos());
    expect(tarjeta('Frontend').getByText('Ana García')).toBeTruthy();
    expect(tarjeta('Frontend').queryByText('Beto Ruiz')).toBeNull();
    expect(tarjeta('Backend').getByText('Beto Ruiz')).toBeTruthy();
    // El id se enseña: es lo que se lee en el JSON y lo que nombran los rechazos.
    expect(tarjeta('Backend').getByText('pm-backend')).toBeTruthy();
  });

  /**
   * Regla 2 y regla 3 sobre un valor derivado: `null` cuando nadie tiene dato NO se pinta
   * como `0` —diría «este equipo no puede con nada» cuando nadie ha escrito nada— y el
   * número nunca sale sin cuántos miembros lo respaldan.
   */
  it('la capacidad va siempre con su cobertura, y sin dato no es cero', () => {
    montarEquipos(dosEquipos());
    expect(tarjeta('Frontend').getByText(/8 pts · 1 de 1 miembro/)).toBeTruthy();
    const backend = tarjeta('Backend').getByText(/sin capacidad declarada · 0 de 1 miembro/);
    expect(backend).toBeTruthy();
    expect(backend.textContent).not.toMatch(/\b0 pts\b/);
  });

  it('un proyecto sin equipos dice cuántas tareas quedaron sin equipo', () => {
    const { container } = montarEquipos(arbolConTareas(3).doc);
    expect(container.textContent).toMatch(/Sin equipos todavía\. Sus 3 tareas están sin equipo\./);
  });

  it('en solo lectura no hay un solo control de edición', () => {
    dobles.soloLectura = true;
    montarEquipos(dosEquipos());
    expect(screen.queryByLabelText('Nombre del equipo Backend')).toBeNull();
    expect(screen.queryByRole('button', { name: /Crear equipo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Quitar a/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar…' })).toBeNull();
  });
});

describe('editar un equipo toca EL SUYO', () => {
  it('renombrar el segundo equipo manda su equipoId, no el del primero', () => {
    montarEquipos(dosEquipos());
    const campo = screen.getByLabelText('Nombre del equipo Backend');
    fireEvent.change(campo, { target: { value: 'Servicios' } });
    fireEvent.blur(campo);

    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'editarEquipo', equipoId: 'pm-backend', nombre: 'Servicios' },
      'Renombrar el equipo Backend',
    );
  });

  it('renombrar con el mismo texto no manda nada: un comando sin cambio no es un cambio', () => {
    montarEquipos(dosEquipos());
    const campo = screen.getByLabelText('Nombre del equipo Backend');
    fireEvent.change(campo, { target: { value: '  Backend  ' } });
    fireEvent.blur(campo);
    expect(dobles.mutar).not.toHaveBeenCalled();
  });

  /** Regla 14: el campo que el usuario escribió a mano dentro del miembro sigue ahí. */
  it('cambiar responsabilidades reenvía la lista completa y conserva lo que no toca', () => {
    montarEquipos(dosEquipos());
    const campo = screen.getByLabelText('Responsabilidades de Ana García en Frontend');
    fireEvent.change(campo, { target: { value: 'vistas, accesibilidad' } });
    fireEvent.blur(campo);

    expect(dobles.mutar).toHaveBeenCalledWith(
      {
        comando: 'editarEquipo',
        equipoId: 'pm-frontend',
        miembros: [
          {
            persona_id: 'ana-garcia',
            responsabilidades: ['vistas', 'accesibilidad'],
            capacidad: 8,
            nota: 'media jornada',
          },
        ],
      },
      'Cambiar las responsabilidades de Ana García en Frontend',
    );
  });

  it('vaciar la capacidad la deja en null, nunca en 0', () => {
    montarEquipos(dosEquipos());
    const campo = screen.getByLabelText('Capacidad de Ana García en Frontend');
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.blur(campo);

    const [comando] = dobles.mutar.mock.calls[0] ?? [];
    expect(comando).toMatchObject({ comando: 'editarEquipo', equipoId: 'pm-frontend' });
    expect(comando.miembros[0].capacidad).toBeNull();
  });

  it('una capacidad negativa no se manda y tampoco se traga en silencio', () => {
    montarEquipos(dosEquipos());
    const campo = screen.getByLabelText('Capacidad de Ana García en Frontend') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '-3' } });
    fireEvent.blur(campo);

    expect(dobles.mutar).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toMatch(/no es un número de cero para arriba/);
    // Y el campo vuelve a lo guardado: lo que se ve y lo que hay en el documento coinciden.
    expect(campo.value).toBe('8');
  });

  it('quitar a alguien manda la lista de ESE equipo sin esa persona', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(screen.getByRole('button', { name: 'Quitar a Beto Ruiz de Backend' }));

    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'editarEquipo', equipoId: 'pm-backend', miembros: [] },
      'Quitar a Beto Ruiz de Backend',
    );
  });

  it('agregar toma del catálogo global, no da de alta a nadie', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(tarjeta('Backend').getByRole('button', { name: /Agregar a alguien/ }));
    const select = tarjeta('Backend').getByRole('combobox', { name: 'Del catálogo de personas' });
    // Beto ya está dentro: solo se ofrece quien falta.
    expect(within(select).queryByRole('option', { name: 'Beto Ruiz' })).toBeNull();
    fireEvent.change(select, { target: { value: 'ana-garcia' } });

    expect(dobles.mutar).toHaveBeenCalledWith(
      {
        comando: 'editarEquipo',
        equipoId: 'pm-backend',
        miembros: [
          { persona_id: 'beto-ruiz', responsabilidades: [], capacidad: null },
          { persona_id: 'ana-garcia', responsabilidades: [], capacidad: null },
        ],
      },
      'Meter a Ana García en Backend',
    );
  });
});

describe('mover a alguien de un equipo a otro', () => {
  /**
   * Es lo que permite partir el «General» de la migración sin perder ningún rol: un solo
   * comando, un solo paso de deshacer, y la ficha del miembro viaja entera. Dos
   * `editarEquipo` pasarían por un estado en el que la persona no está en ninguno.
   */
  it('manda moverMiembro con origen y destino, no dos editarEquipo', () => {
    montarEquipos(dosEquipos());
    const select = screen.getByLabelText('Mover a Ana García a otro equipo');
    fireEvent.change(select, { target: { value: 'pm-backend' } });

    expect(dobles.mutar).toHaveBeenCalledTimes(1);
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'moverMiembro', personaId: 'ana-garcia', desde: 'pm-frontend', hacia: 'pm-backend' },
      'Mover a Ana García fuera de Frontend',
    );
  });

  it('el destino nunca se ofrece a sí mismo', () => {
    montarEquipos(dosEquipos());
    const select = screen.getByLabelText('Mover a Ana García a otro equipo');
    expect(within(select).queryByRole('option', { name: 'Frontend' })).toBeNull();
    expect(within(select).getByRole('option', { name: 'Backend' })).toBeTruthy();
  });
});

describe('crear un equipo', () => {
  it('el id se propone desde el nombre y el comando lo lleva tecleado', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(screen.getByRole('button', { name: /Crear equipo en PM/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Diseño' } });
    expect((screen.getByLabelText('Id') as HTMLInputElement).value).toBe('pm-diseno');

    fireEvent.click(screen.getByRole('button', { name: 'Crear equipo' }));
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-diseno', nombre: 'Diseño' },
      'Crear el equipo Diseño en PM',
    );
  });

  /** El campo dice qué admite ANTES de fallar; el rechazo no puede ser la primera noticia. */
  it('un id ocupado bloquea el alta y nombra el choque', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(screen.getByRole('button', { name: /Crear equipo en PM/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } });
    fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'pm-backend' } });

    expect(screen.getByText(/Ya existe un equipo con el id «pm-backend»: "Backend" de PM\./)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Crear equipo' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Crear equipo' }));
    expect(dobles.mutar).not.toHaveBeenCalled();
  });

  it('el id deja de seguir al nombre en cuanto se teclea', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(screen.getByRole('button', { name: /Crear equipo en PM/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Diseño' } });
    fireEvent.change(screen.getByLabelText('Id'), { target: { value: 'pm-ux' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Diseño y UX' } });
    expect((screen.getByLabelText('Id') as HTMLInputElement).value).toBe('pm-ux');
  });
});

describe('eliminar un equipo', () => {
  /**
   * El mensaje con el conteo y los ids lo escribe el reductor y llega entero a la franja
   * de aviso. La pantalla ANTICIPA con el mismo conteo para que el usuario no llegue al
   * rechazo sin saber por qué — y **no bloquea el botón**: si lo bloqueara, el mensaje
   * bueno no llegaría nunca y el usuario se quedaría con la versión corta de aquí.
   */
  it('con tareas asignadas anticipa el conteo y deja llegar el rechazo del reductor', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(tarjeta('Backend').getByRole('button', { name: 'Eliminar…' }));
    expect(tarjeta('Backend').getByText(/2 tareas lo tienen asignado/)).toBeTruthy();

    const boton = tarjeta('Backend').getByRole('button', { name: 'Eliminar Backend' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'eliminarEquipo', equipoId: 'pm-backend' },
      'Eliminar el equipo Backend',
    );
  });

  it('sin tareas asignadas dice qué se lleva y que ⌘Z lo devuelve', () => {
    montarEquipos(dosEquipos());
    fireEvent.click(tarjeta('Frontend').getByRole('button', { name: 'Eliminar…' }));
    const texto = tarjeta('Frontend').getByText(/Ninguna tarea lo tiene asignado/);
    expect(texto.textContent).toMatch(/1 miembro/);
    expect(texto.textContent).toMatch(/⌘Z/);
  });
});

describe('responsable fuera del equipo', () => {
  /**
   * Informa, no rechaza: no hay ninguna invariante que obligue a que el responsable de una
   * tarea esté en su equipo, y una tarea vieja de alguien que se cambió de equipo es un
   * hecho correcto. La pantalla lo enseña y no ofrece nada que lo «corrija».
   */
  it('nombra las tareas y no ofrece ningún control que lo impida', () => {
    const doc = aplicarTodos(dosEquipos(), [
      { comando: 'editarTarea', id: 'PM-T1', responsable: 'ana-garcia' },
    ]);
    montarEquipos(doc);
    const backend = tarjeta('Backend');
    expect(backend.getByText(/1 responsable fuera del equipo/)).toBeTruthy();
    expect(backend.getByText('PM-T1')).toBeTruthy();
    expect(backend.getByText(/No es un error/)).toBeTruthy();
  });
});

describe('un miembro dado de baja', () => {
  /**
   * El reductor rechaza la lista entera si alguien de ella no es asignable, así que un
   * inactivo dentro del equipo congela TODA la tarjeta. Se dice antes, y se dice quién:
   * un «no se pudo guardar» sobre cuatro filas no señala cuál de las cuatro lo provoca.
   */
  it('se avisa de que bloquea cualquier cambio del equipo, y se le nombra', () => {
    // A mano y no con `desactivarPersona`: ese comando saca a la persona de sus equipos,
    // así que por la app este estado no se alcanza. Se alcanza por el otro camino que el
    // documento tiene —el usuario editando el JSON (regla 14)—, y es el que se simula.
    const doc = dosEquipos();
    const beto = doc.personas.find((persona) => persona.id === 'beto-ruiz');
    if (beto === undefined) throw new Error('el fixture perdió a Beto');
    beto.activa = false;
    montarEquipos(doc);
    const backend = tarjeta('Backend');
    expect(backend.getByText(/Beto Ruiz está dada de baja/)).toBeTruthy();
    expect(backend.getByText(/ningún cambio de esta tarjeta se va a poder guardar/)).toBeTruthy();
    // Y la salida sigue existiendo: quitarla del equipo desatasca la tarjeta.
    expect(backend.getByRole('button', { name: 'Quitar a Beto Ruiz de Backend' })).toBeTruthy();
  });
});

describe('la migración «General» se ve en pantalla y se parte a mano', () => {
  /** El equipo único que dejó la migración de M2, con dos personas y dos roles distintos. */
  function conGeneral(): Documento {
    return aplicarTodos(arbolConEquipo('pm-general', 'General').doc, [
      { comando: 'crearPersona', nombre: 'Ana García' },
      { comando: 'crearPersona', nombre: 'Beto Ruiz' },
      {
        comando: 'editarEquipo',
        equipoId: 'pm-general',
        miembros: [
          { persona_id: 'ana-garcia', responsabilidades: ['vistas'], capacidad: null },
          { persona_id: 'beto-ruiz', responsabilidades: ['api'], capacidad: null },
        ],
      },
    ]);
  }

  it('se ve con los roles que trajo, y todavía no ofrece a dónde mover', () => {
    montarEquipos(conGeneral());
    const general = tarjeta('General');
    expect((general.getByLabelText('Responsabilidades de Ana García en General') as HTMLInputElement).value).toBe('vistas');
    expect((general.getByLabelText('Responsabilidades de Beto Ruiz en General') as HTMLInputElement).value).toBe('api');
    // Sin otro equipo no hay a dónde: ofrecer un destino que no existe sería ofrecer un
    // control que solo puede fallar.
    expect(screen.queryByLabelText('Mover a Ana García a otro equipo')).toBeNull();
  });

  it('partirlo es crear el segundo equipo y mover, no un apaño sobre equipos[0]', () => {
    montarEquipos(conGeneral());
    fireEvent.click(screen.getByRole('button', { name: /Crear equipo en PM/ }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Frontend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear equipo' }));
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' },
      'Crear el equipo Frontend en PM',
    );

    // El documento lo repinta el proceso principal, así que la segunda mitad del gesto se
    // ejercita sobre el documento QUE VUELVE, no sobre el que se mandó.
    cleanup();
    dobles.mutar.mockClear();
    const partido = aplicarTodos(conGeneral(), [
      { comando: 'crearEquipo', proyecto: 'PM', id: 'pm-frontend', nombre: 'Frontend' },
    ]);
    montarEquipos(partido);
    fireEvent.change(screen.getByLabelText('Mover a Ana García a otro equipo'), {
      target: { value: 'pm-frontend' },
    });

    // `moverMiembro` y no dos `editarEquipo`: la ficha entera viaja con ella —es lo que
    // impide perder el `rol`— y ⌘Z lo revierte de una sola vez.
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'moverMiembro', personaId: 'ana-garcia', desde: 'pm-general', hacia: 'pm-frontend' },
      'Mover a Ana García fuera de General',
    );
  });
});

// --- la ficha de persona ----------------------------------------------------

describe('la ficha de persona conserva la adscripción en SOLO LECTURA', () => {
  it('la misma persona en dos proyectos aparece UNA vez con las DOS adscripciones', () => {
    montarPersonas(dosProyectos());
    const filas = screen.getAllByText('Ana García');
    expect(filas).toHaveLength(1);

    const fila = filas[0]?.closest('.fila-persona');
    expect(fila).not.toBeNull();
    const dentro = within(fila as HTMLElement);
    expect(dentro.getByText('PM · Frontend')).toBeTruthy();
    expect(dentro.getByText('SIBE · Datos')).toBeTruthy();
    expect(dentro.getByText('en 2 equipos')).toBeTruthy();
  });

  it('no hay ningún control para cambiar los equipos desde aquí', () => {
    montarPersonas(dosProyectos());
    const fila = screen.getAllByText('Ana García')[0]?.closest('.fila-persona');
    const dentro = within(fila as HTMLElement);
    expect(dentro.queryByRole('combobox')).toBeNull();
    expect(dentro.queryByRole('button', { name: /equipo/i })).toBeNull();
  });
});

describe('el alta de una persona adscribe a un EQUIPO', () => {
  /**
   * La regresión que el compilador no puede ver: `equipos` es `string[]` y una clave de
   * proyecto encaja igual de bien que un id de equipo. Mandarla compila y revienta al
   * usarla, con un «no existe el equipo "PM"» en tiempo de ejecución.
   */
  it('manda el id del equipo, nunca la clave del proyecto', () => {
    montarPersonas(dosProyectos());
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Carla Díaz' } });
    fireEvent.change(screen.getByLabelText('Equipo inicial (opcional)'), {
      target: { value: 'sibe-datos' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dar de alta' }));

    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'crearPersona', nombre: 'Carla Díaz', equipos: ['sibe-datos'] },
      'Dar de alta a Carla Díaz',
    );
  });

  it('los equipos se agrupan por proyecto: cuatro «Frontend» sueltos no se distinguen', () => {
    montarPersonas(dosProyectos());
    const select = screen.getByLabelText('Equipo inicial (opcional)');
    const grupos = [...select.querySelectorAll('optgroup')].map((g) => g.label);
    expect(grupos).toEqual(['PM · Proyecto PM', 'SIBE · Sistema de becas']);
    expect(within(select).getByRole('option', { name: 'Frontend' })).toBeTruthy();
  });

  it('sin ningún equipo se puede dar de alta igual, y se dice dónde se crean', () => {
    montarPersonas(arbolConTareas(1).doc);
    expect(screen.getByText(/los equipos se crean en la sección Equipos/i)).toBeTruthy();
    expect(screen.queryByLabelText('Equipo inicial (opcional)')).toBeNull();
  });
});
