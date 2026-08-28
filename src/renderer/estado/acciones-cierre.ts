/**
 * Las acciones de la pantalla de cierre, en un solo sitio.
 *
 * ## Dos actos, dos pilas de deshacer
 *
 * Corregir el estado de una tarea («no, no terminó»), destrabar una bloqueada y ponerle
 * responsable a la que pasa sin nadie son **decisiones separadas del usuario** y salen
 * como comandos propios (`cambiarEstado`, `desbloquear`, `editarTarea`) ANTES del cierre.
 * Se deshacen por separado porque se tomaron por separado: arreglar un responsable y
 * arrepentirse no debería obligar a deshacer el cierre entero.
 *
 * El cierre en cambio es **un solo comando y un solo deshacer**: `cerrarSprint` con todas
 * las decisiones dentro. Catorce tareas repartidas en tres destinos con catorce comandos
 * dejarían una pila de deshacer que el usuario tendría que recorrer catorce veces para
 * volver a donde estaba, y a la mitad del camino el sprint estaría medio cerrado.
 *
 * ## El contrato ampliado de `cerrarSprint`
 *
 * `decisiones` y `siguienteSprintId` son el contrato acordado con `backend` para E8. El
 * esquema Zod de `src/principal/comandos/tipos.ts` es `strict` y todavía puede no
 * conocerlos: mientras no los conozca, el proceso principal rechaza el payload y la app
 * lo dice en su franja de aviso sin escribir nada, que es exactamente lo que la regla 5
 * pide. No se manda una versión recortada del comando «para que pase»: cerrar el sprint
 * perdiendo las decisiones del usuario en silencio sería mucho peor que no cerrarlo.
 */

import { useCallback, useMemo } from 'react';

import type { DecisionCierre } from '../../compartido/dominio/cierre';
import type { Sprint } from '../../compartido/modelo/tipos';
import type { Comando } from '../puente/api';
import { useMutar } from './mutaciones';

/**
 * `cerrarSprint` con las decisiones del cierre.
 *
 * Se declara aquí y no se toca `src/principal/comandos/tipos.ts`, que es de `backend`.
 * Es asignable a `Comando` porque añade solo campos opcionales sobre el miembro
 * `cerrarSprint` de la unión: el día que el esquema los incorpore, este tipo se puede
 * borrar y nada más cambia.
 */
export interface ComandoCerrarSprint {
  comando: 'cerrarSprint';
  sprintId: string;
  /** Qué pasa con cada tarea no terminada. Las que no se nombren: `siguiente`. */
  decisiones?: DecisionCierre[];
  /** A dónde van las de destino `siguiente`. Si no se manda, el reductor lo crea. */
  siguienteSprintId?: string;
}

export interface AccionesCierre {
  /** «No, no terminó»: la devuelve a en curso. Comando propio, deshacer propio. */
  corregir(tareaId: string): Promise<void>;
  /** El inverso: marcarla hecha desde el bloque de las que no terminaron. */
  darPorHecha(tareaId: string): Promise<void>;
  /** «Ya se destrabó»: cierra el bloqueo vigente conservando su registro histórico. */
  destrabar(tareaId: string): Promise<void>;
  /** Arregla el aviso del pie sin salir de la pantalla. `null` la deja sin responsable. */
  asignar(tareaId: string, personaId: string | null): Promise<void>;
  /** El cierre entero, en un comando. Devuelve `true` si se aplicó. */
  cerrar(decisiones: DecisionCierre[], siguienteSprintId: string | undefined): Promise<boolean>;
}

export function useAccionesCierre(sprint: Sprint): AccionesCierre {
  const mutar = useMutar();

  const corregir = useCallback(
    async (tareaId: string) => {
      await mutar(
        { comando: 'cambiarEstado', id: tareaId, estado: 'iniciado' },
        `Corregir ${tareaId} a «en curso»`,
      );
    },
    [mutar],
  );

  const darPorHecha = useCallback(
    async (tareaId: string) => {
      await mutar({ comando: 'cambiarEstado', id: tareaId, estado: 'done' }, `Dar ${tareaId} por hecha`);
    },
    [mutar],
  );

  const destrabar = useCallback(
    async (tareaId: string) => {
      await mutar({ comando: 'desbloquear', tareaId }, `Destrabar ${tareaId}`);
    },
    [mutar],
  );

  const asignar = useCallback(
    async (tareaId: string, personaId: string | null) => {
      // Va a la TAREA y no al item: el item de este sprint está a punto de congelarse, y
      // lo que necesita responsable es la tarea que sigue viva en el sprint siguiente.
      await mutar(
        { comando: 'editarTarea', id: tareaId, responsable: personaId },
        `Asignar ${tareaId}`,
      );
    },
    [mutar],
  );

  const cerrar = useCallback(
    async (decisiones: DecisionCierre[], siguienteSprintId: string | undefined) => {
      const comando: ComandoCerrarSprint = { comando: 'cerrarSprint', sprintId: sprint.id };
      if (decisiones.length > 0) comando.decisiones = decisiones;
      if (siguienteSprintId !== undefined) comando.siguienteSprintId = siguienteSprintId;
      // El parámetro de `mutar` ya es `Comando`: si el día de mañana `ComandoCerrarSprint`
      // dejara de encajar en la unión, esta línea es la que deja de compilar.
      const payload: Comando = comando;
      return mutar(payload, `Cerrar ${sprint.nombre}`);
    },
    [mutar, sprint.id, sprint.nombre],
  );

  return useMemo(
    () => ({ corregir, darPorHecha, destrabar, asignar, cerrar }),
    [asignar, cerrar, corregir, darPorHecha, destrabar],
  );
}
