/**
 * El único sitio del renderer desde el que se escribe.
 *
 * Toda mutación de E7 pasa por `useMutar`. No es ceremonia: concentra tres cosas que si
 * se copian en veinte `onClick` se copian mal.
 *
 * 1. **Regla 9.** Lo que sale de aquí es un `Comando` con nombre, tipado contra
 *    `src/principal/comandos/tipos.ts`. El documento no viaja nunca en esta dirección.
 * 2. **Regla 5 — nunca revertir por un fallo de guardado.** El renderer no muta el
 *    documento por su cuenta: lo repinta cuando el proceso principal devuelve una
 *    instantánea nueva. Así que un comando fallido no tiene nada que revertir, y lo que
 *    el usuario acaba de teclear sigue en el `useState` de su formulario, que se queda
 *    ABIERTO. Se avisa y se reintenta.
 * 3. **Solo lectura.** Con el archivo en conflicto o inválido (regla 13) el proceso
 *    principal ya rechaza todo, pero devolvería un error críptico. Aquí se para antes y
 *    se dice por qué.
 */

import { useCallback } from 'react';

import { useAccionesAlmacen, useAlmacen } from './almacen';
import { useAccionesInterfaz } from './interfaz';
import type { Comando } from '../puente/api';

/** ¿La app puede escribir ahora mismo? */
export function useSoloLectura(): boolean {
  const estado = useAlmacen();
  return estado.fase === 'cargado' && estado.instantanea.modo === 'solo-lectura';
}

/** ¿Hay algo en la pila de deshacer del proceso principal? */
export function usePuedeDeshacer(): boolean {
  const estado = useAlmacen();
  return estado.fase === 'cargado' && estado.instantanea.puedeDeshacer;
}

/**
 * Aplica un comando. Devuelve `true` si se aplicó.
 *
 * `contexto` es lo que el usuario creía estar haciendo («Mover SICOE-T14 al sprint»), y
 * se antepone al mensaje del reductor. Un «no existe la persona "x"» a secas no le dice
 * a nadie qué acción se quedó sin hacer.
 */
export type Mutar = (comando: Comando, contexto: string) => Promise<boolean>;

export function useMutar(): Mutar {
  const { aplicar } = useAccionesAlmacen();
  const { avisar } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();

  return useCallback(
    async (comando, contexto) => {
      if (soloLectura) {
        avisar(`${contexto}: la app está en solo lectura y no escribió nada.`);
        return false;
      }
      const respuesta = await aplicar(comando);
      if (respuesta.ok) {
        avisar(null);
        return true;
      }
      const detalle = respuesta.detalles?.length ? ` (${respuesta.detalles.join('; ')})` : '';
      avisar(`${contexto}: ${respuesta.mensaje}${detalle}`);
      return false;
    },
    [aplicar, avisar, soloLectura],
  );
}
