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

import type { Documento } from '../../compartido/modelo/tipos';
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
export type Mutar = (comando: Comando, contexto: string, inocuo?: EsInocuo) => Promise<boolean>;

/**
 * Rechazos que para quien los provocó no son un fallo, sino «no pasó nada».
 *
 * Existe por un caso concreto y muy frecuente: **soltar algo donde ya estaba**. El
 * reductor lo rechaza a propósito —un comando que no cambia nada no debe apilarse en
 * deshacer ni escribir bitácora—, pero eso es una decisión del modelo, no un error del
 * usuario. Pintarlo de rojo enseñaría que el gesto más común de un arrastre está mal.
 *
 * Se pasa un predicado en vez de una lista de códigos porque `invalido` cubre también
 * rechazos que SÍ hay que contar (arrastrar entre padres distintos, por ejemplo): quien
 * manda el comando es el único que sabe cuál de sus rechazos era el desenlace esperado.
 *
 * **No es la defensa principal.** Quien reordena comprueba antes si el destino coincide
 * con el origen y ni siquiera manda el comando (ver `util/orden.ts`); esto solo cubre la
 * carrera de que el documento haya cambiado bajo los pies entre el arrastre y el envío.
 */
export type EsInocuo = (fallo: { codigo: string; mensaje: string }) => boolean;

/**
 * Igual que `useMutar`, pero devuelve el DOCUMENTO resultante en vez de un booleano.
 *
 * Lo necesita exactamente un caso: capturar una tarea desde el Sprint global, donde hace
 * falta el id que acaba de emitir el contador del proyecto para poder moverla al sprint
 * en el mismo gesto. El id no viaja en la respuesta del comando —y adivinarlo desde el
 * renderer sería replicar `siguienteId`—, así que se lee del documento que vuelve.
 *
 * `useMutar` está construido encima: un solo camino de escritura, una sola forma de
 * avisar de un fallo (regla 5: no se revierte nada, se cuenta lo que pasó).
 */
export type Aplicar = (
  comando: Comando,
  contexto: string,
  inocuo?: EsInocuo,
) => Promise<Documento | null>;

export function useAplicar(): Aplicar {
  const { aplicar } = useAccionesAlmacen();
  const { avisar, apilarDeshacer } = useAccionesInterfaz();
  const soloLectura = useSoloLectura();

  return useCallback(
    async (comando, contexto, inocuo) => {
      if (soloLectura) {
        avisar(`${contexto}: la app está en solo lectura y no escribió nada.`);
        return null;
      }
      const respuesta = await aplicar(comando);
      if (respuesta.ok) {
        avisar(null);
        // El proceso principal acaba de apilar el documento anterior; aquí se apunta CÓMO
        // se llamaba, que es lo único que le falta al menú Edición para poder decir
        // «Deshacer capturar SICOE-T14» en vez de «Deshacer» a secas.
        apilarDeshacer(contexto);
        return respuesta.instantanea.documento;
      }

      // Un rechazo esperado no borra el aviso que hubiera puesto, ni pone uno nuevo: no
      // pasó nada, y «no pasó nada» no es una noticia.
      if (inocuo?.(respuesta)) return null;
      const detalle = respuesta.detalles?.length ? ` (${respuesta.detalles.join('; ')})` : '';
      avisar(`${contexto}: ${respuesta.mensaje}${detalle}`);
      return null;
    },
    [apilarDeshacer, aplicar, avisar, soloLectura],
  );

}

export function useMutar(): Mutar {
  const aplicar = useAplicar();
  return useCallback(
    async (comando, contexto, inocuo) => (await aplicar(comando, contexto, inocuo)) !== null,
    [aplicar],
  );
}
