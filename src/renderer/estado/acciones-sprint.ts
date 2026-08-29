/**
 * Las tres acciones del compromiso, en un solo sitio.
 *
 * Soltar en el sprint, pulsar `S` y el botón «Al sprint» de una historia tienen que
 * hacer EXACTAMENTE lo mismo, o el teclado deja de ser equivalente al ratón y se
 * convierte en un atajo de segunda que hace algo parecido. Por eso no hay tres
 * implementaciones: hay una y tres formas de llamarla.
 *
 * **Soltar ES el compromiso.** La tarea entra al sprint al soltarla y el formulario se
 * abre DESPUÉS. Si el formulario pudiera cancelar el movimiento, mover diez tareas serían
 * diez negociaciones y el usuario dejaría de arrastrar.
 */

import { useCallback, useMemo } from 'react';

import { estaAbierta, estaEnSprint } from '../../compartido/dominio/clasificar';
import type { Historia, Sprint, Tarea } from '../../compartido/modelo/tipos';
import { useAccionesInterfaz } from './interfaz';
import { useMutar } from './mutaciones';

export interface AccionesSprint {
  /** ¿Esta tarea puede entrar al sprint activo ahora mismo? */
  admiteSprint(tarea: Tarea): boolean;
  /** Tareas de la historia que entrarían en un envío en lote. */
  loteDe(historia: Historia): Tarea[];
  mover(tarea: Tarea): Promise<void>;
  moverLote(historia: Historia): Promise<void>;
  sacar(tareaId: string): Promise<void>;
  /**
   * Sacar de un sprint CONCRETO. La vista global mezcla los sprints activos de todos los
   * proyectos, y ahí `sacar` no puede suponer cuál es el sprint de la tarjeta: la tarjeta
   * lo sabe y lo pasa. `sacar` es esto mismo con el sprint que se le dio al hook.
   */
  sacarDe(tareaId: string, sprintId: string): Promise<void>;
}

export function useAccionesSprint(sprint: Sprint | undefined): AccionesSprint {
  const mutar = useMutar();
  const { redactar, avisar, confirmar } = useAccionesInterfaz();

  const admiteSprint = useCallback(
    (tarea: Tarea) =>
      sprint !== undefined &&
      sprint.estado !== 'cerrado' &&
      !estaEnSprint(tarea.id, sprint) &&
      // Una tarea cancelada no entra en ningún denominador (`contarTareas`), así que
      // comprometerla no significa nada: la tarjeta no diría nada y el conteo tampoco.
      tarea.estado !== 'cancelada',
    [sprint],
  );

  const loteDe = useCallback(
    (historia: Historia) =>
      // Del lote se excluye lo ya terminado además de lo ya comprometido: llevar al
      // sprint algo que ya está hecho llena el panel de tarjetas que no piden nada.
      historia.tareas.filter((tarea) => admiteSprint(tarea) && estaAbierta(tarea)),
    [admiteSprint],
  );

  const mover = useCallback(
    async (tarea: Tarea) => {
      if (sprint === undefined) {
        avisar('No hay ningún sprint activo: abre uno antes de comprometer tareas.');
        return;
      }
      const ok = await mutar(
        { comando: 'moverAlSprint', tareaId: tarea.id, sprintId: sprint.id },
        `Mover ${tarea.id} al sprint`,
      );
      // El formulario se abre DESPUÉS de que la tarea ya esté dentro, nunca antes.
      if (ok) redactar({ tipo: 'compromiso', tareaId: tarea.id });
    },
    [avisar, mutar, redactar, sprint],
  );

  const moverLote = useCallback(
    async (historia: Historia) => {
      if (sprint === undefined) {
        avisar('No hay ningún sprint activo: abre uno antes de comprometer tareas.');
        return;
      }
      const lote = loteDe(historia);
      if (lote.length === 0) return;
      // En serie y no en paralelo: cada comando produce un documento nuevo, y mandarlos
      // a la vez haría que el último pisara a los anteriores. Además el orden del array
      // ES la prioridad, y en paralelo no habría orden.
      for (const tarea of lote) {
        const ok = await mutar(
          { comando: 'moverAlSprint', tareaId: tarea.id, sprintId: sprint.id },
          `Mover ${tarea.id} al sprint`,
        );
        if (!ok) return; // el aviso ya está puesto; no se sigue empujando contra un error
      }
      // Un lote NO abre formulario: ocho tareas serían ocho formularios encadenados, que
      // es justo lo que el botón existe para evitar. Las tarjetas caen marcadas «Falta
      // quién y para cuándo», que es la verdad y se ve de un vistazo.
      redactar(null);
    },
    [avisar, loteDe, mutar, redactar, sprint],
  );

  const sacarDe = useCallback(
    async (tareaId: string, sprintId: string) => {
      // El diálogo vive arriba de ambas vistas de sprint: así botón y drag comparten la
      // misma excepción N16 y ninguno puede sacar por un camino silencioso.
      confirmar({ tipo: 'sacarDelSprint', tareaId, sprintId });
    },
    [confirmar],
  );

  const sacar = useCallback(
    async (tareaId: string) => {
      if (sprint === undefined) return;
      await sacarDe(tareaId, sprint.id);
    },
    [sacarDe, sprint],
  );

  return useMemo(
    () => ({ admiteSprint, loteDe, mover, moverLote, sacar, sacarDe }),
    [admiteSprint, loteDe, mover, moverLote, sacar, sacarDe],
  );
}
