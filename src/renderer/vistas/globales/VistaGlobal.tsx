/**
 * El enrutador de las vistas globales.
 *
 * Las siete están construidas: seis en E9–E11 y el Sprint transversal en E12, que era la
 * que faltaba. Ya no hay marcador de posición aquí; si alguna vez vuelve a haber una vista
 * sin construir, el patrón honesto está en el historial de este archivo — decir qué
 * pregunta va a contestar y enseñar solo el número que ya se sostiene, nunca una tabla
 * simulada.
 */

import type { Documento, Fecha } from '../../../compartido/modelo/tipos';
import type { IdVistaGlobal } from '../../estado/interfaz';
import { VistaBacklog } from './VistaBacklog';
import { VistaBloqueos } from './VistaBloqueos';
import { VistaCarga } from './VistaCarga';
import { VistaPanorama } from './VistaPanorama';
import { VistaSprintGlobal } from './VistaSprintGlobal';
import { VistaTerminadas } from './VistaTerminadas';
import { VistaTiempos } from './VistaTiempos';

export function VistaGlobal({
  id,
  documento,
  hoy,
}: {
  id: IdVistaGlobal;
  documento: Documento;
  hoy: Fecha;
}) {
  switch (id) {
    case 'panorama':
      return <VistaPanorama documento={documento} hoy={hoy} />;
    case 'sprint':
      return <VistaSprintGlobal documento={documento} hoy={hoy} />;
    case 'bloqueos':
      return <VistaBloqueos documento={documento} hoy={hoy} />;
    case 'terminadas':
      return <VistaTerminadas documento={documento} />;
    case 'backlog':
      return <VistaBacklog documento={documento} hoy={hoy} />;
    case 'carga':
      return <VistaCarga documento={documento} hoy={hoy} />;
    case 'tiempos':
      // `hoy` porque un tramo abierto no tiene final: la única forma de decir desde hace
      // cuánto corre es contra el día de quien mira, y ese día entra como dato.
      return <VistaTiempos documento={documento} hoy={hoy} />;
  }
}
