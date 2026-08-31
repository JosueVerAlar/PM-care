import { useEffect, useMemo, useRef, useState } from 'react';

import { compromisoEfectivo, indexarTareas } from '../../../compartido/dominio/derivar';
import { diasEntre, primerDiaHabil, sumarDias } from '../../../compartido/dominio/clasificar';
import type { Documento, Fecha, Sprint } from '../../../compartido/modelo/tipos';
import { useMutar } from '../../estado/mutaciones';

interface Props {
  documento: Documento;
  clave: string;
  hoy: Fecha;
  sprint?: Sprint;
  cerrar: () => void;
}

function defaultDeFin(documento: Documento, clave: string, inicio: Fecha) {
  const propios = documento.sprints.filter((s) => s.clave === clave && s.estado === 'cerrado');
  const muestra = propios.length > 0
    ? propios
    : documento.sprints.filter((s) => s.clave !== clave && s.estado === 'cerrado');
  if (muestra.length === 0) return { fin: '', nota: '' };
  const ordenados = [...muestra].sort((a, b) => diasEntre(a.inicio, a.fin) - diasEntre(b.inicio, b.fin));
  const representante = ordenados[Math.floor((ordenados.length - 1) / 2)]!;
  const dias = diasEntre(representante.inicio, representante.fin) + 1;
  return {
    fin: sumarDias(inicio, dias - 1),
    nota: ordenados.length === 1 ? `${dias} días, como ${representante.nombre}` : `${dias} días, mediana de ${ordenados.length} sprints cerrados`,
  };
}

export function FormularioSprint({ documento, clave, hoy, sprint, cerrar }: Props) {
  const mutar = useMutar();
  const creando = sprint === undefined;
  const inicioPropuesto = useMemo(() => primerDiaHabil(sumarDias(hoy, 1)), [hoy]);
  const sugerencia = useMemo(() => defaultDeFin(documento, clave, inicioPropuesto), [documento, clave, inicioPropuesto]);
  const [nombre, setNombre] = useState(sprint?.nombre ?? '');
  const [inicio, setInicio] = useState(sprint?.inicio ?? inicioPropuesto);
  const [fin, setFin] = useState(sprint?.fin ?? sugerencia.fin);
  const refInicio = useRef<HTMLInputElement>(null);
  const refFin = useRef<HTMLInputElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);

  useEffect(() => {
    (sprint?.estado === 'activo' ? refFin.current : refInicio.current)?.focus();
  }, [sprint?.estado]);
  /**
   * El nombre que la app pondrá si el campo se queda vacío. Sale del contador del
   * proyecto, que es de donde lo saca el reductor al crear: si se leyera de otro sitio,
   * el texto prometería un nombre y el comando escribiría otro.
   *
   * NO cae de vuelta a lo tecleado: «se llamará» describe lo que pasa cuando NO tecleas,
   * y decir «se llamará Mi sprint» mientras «Mi sprint» está escrito en el campo es una
   * frase que se contradice a sí misma.
   */
  const proyecto = documento.proyectos.find((otro) => otro.clave === clave);
  const nombrePorOmision = `Sprint ${(proyecto?.contadores.sprints ?? 0) + 1}`;
  const diasElegidos = fin === '' ? null : diasEntre(inicio, fin) + 1;
  const notaDuracion = diasElegidos === null
    ? sugerencia.nota
    : `${diasElegidos} ${diasElegidos === 1 ? 'día elegido' : 'días elegidos'}${sugerencia.nota ? ` · valor inicial: ${sugerencia.nota}` : ''}`;

  const solape = documento.sprints.find((otro) =>
    otro.id !== sprint?.id && otro.clave === clave && otro.estado !== 'cerrado' && inicio <= otro.fin && fin >= otro.inicio,
  );
  const razonDeshabilitado = fin === ''
    ? 'Elige una fecha de fin para continuar.'
    : solape
      ? `Corrige el solape con ${solape.nombre} para continuar.`
      : null;

  const salir = () => {
    const nombreAnterior = focoAnterior.current?.getAttribute('aria-label') ?? focoAnterior.current?.textContent?.trim();
    cerrar();
    window.setTimeout(() => {
      const candidatos = [...document.querySelectorAll<HTMLElement>('button, select, input')];
      const anteriorNuevo = candidatos.find((elemento) =>
        elemento.getAttribute('aria-label') === nombreAnterior || elemento.textContent?.trim() === nombreAnterior,
      );
      (anteriorNuevo ?? focoAnterior.current)?.focus();
    }, 0);
  };
  const consecuencia = useMemo(() => {
    if (sprint?.estado !== 'activo' || fin === sprint.fin) return null;
    const indice = indexarTareas(documento);
    let dejan = 0;
    for (const item of sprint.items) {
      const fecha = compromisoEfectivo(item, indice.get(item.tarea_id)?.tarea).fechaLimite;
      if (fecha !== null && fecha > sprint.fin && fecha <= fin) dejan += 1;
    }
    return `Mover el fin al ${fin}: ${dejan} ${dejan === 1 ? 'tarea deja' : 'tareas dejan'} de estar vencidas`;
  }, [documento.proyectos, fin, sprint]);

  const guardar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (fin === '' || solape !== undefined) return;
    const ok = creando
      ? await mutar({ comando: 'crearSprint', clave, ...(nombre ? { nombre } : {}), inicio, fin }, `Crear sprint de ${clave}`)
      : await mutar({ comando: 'editarSprint', sprintId: sprint.id, nombre, ...(sprint.estado === 'planeado' ? { inicio } : {}), fin }, `Editar ${sprint.nombre}`);
    if (ok) cerrar();
  };

  return <form className="form-sprint" onSubmit={(e) => void guardar(e)} onKeyDown={(evento) => {
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    evento.stopPropagation();
    salir();
  }}>
    <div className="form-sprint__fechas">
      <div className="campo"><label className="campo__etq" htmlFor="sprint-inicio">Inicio</label><input ref={refInicio} id="sprint-inicio" type="date" value={inicio} disabled={sprint?.estado === 'activo'} onChange={(e) => setInicio(e.target.value)} /></div>
      <div className="campo"><label className="campo__etq" htmlFor="sprint-fin">Fin</label><div className="form-sprint__fecha"><input ref={refFin} id="sprint-fin" type="date" required value={fin} onChange={(e) => setFin(e.target.value)} />
        {creando && sugerencia.fin === '' && <button type="button" onClick={() => setFin(sumarDias(inicio, 14))}>+2 semanas</button>}</div></div>
      <div className="form-sprint__avisos">
        {solape && <small className="aviso-campo">Se solapa con {solape.nombre}. Corrige las fechas para continuar.</small>}
        {fin === '' && <small className="aviso-campo">Elige una fecha de fin para continuar.</small>}
      </div>
    </div>
    {notaDuracion && <small>{notaDuracion}</small>}
    {consecuencia && <small>{consecuencia}</small>}
    <div className="campo"><label className="campo__etq" htmlFor="sprint-nombre">Nombre</label><input id="sprint-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      {creando && nombre.trim() === '' && <small>Si lo dejas vacío, se llamará {nombrePorOmision}</small>}</div>
    <div className="form-sprint__acciones"><button type="button" onClick={salir}>Cancelar</button><button className="boton-solido" type="submit" disabled={razonDeshabilitado !== null} title={razonDeshabilitado ?? undefined}>{creando ? 'Crear sprint' : 'Guardar cambios'}</button></div>
  </form>;
}
