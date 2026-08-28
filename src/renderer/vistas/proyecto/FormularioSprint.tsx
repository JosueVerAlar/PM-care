import { useMemo, useState } from 'react';

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

  const solape = documento.sprints.find((otro) =>
    otro.id !== sprint?.id && otro.clave === clave && otro.estado !== 'cerrado' && inicio <= otro.fin && fin >= otro.inicio,
  );
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
    if (fin === '') return;
    const ok = creando
      ? await mutar({ comando: 'crearSprint', clave, ...(nombre ? { nombre } : {}), inicio, fin }, `Crear sprint de ${clave}`)
      : await mutar({ comando: 'editarSprint', sprintId: sprint.id, nombre, ...(sprint.estado === 'planeado' ? { inicio } : {}), fin }, `Editar ${sprint.nombre}`);
    if (ok) cerrar();
  };

  return <form className="form-sprint" onSubmit={(e) => void guardar(e)}>
    <label>Nombre<input value={nombre} placeholder={creando ? 'Se seguirá la serie automáticamente' : ''} onChange={(e) => setNombre(e.target.value)} /></label>
    <label>Inicio<input type="date" value={inicio} disabled={sprint?.estado === 'activo'} onChange={(e) => setInicio(e.target.value)} /></label>
    <label>Fin<div className="form-sprint__fecha"><input type="date" required value={fin} onChange={(e) => setFin(e.target.value)} />
      {creando && sugerencia.fin === '' && <button type="button" onClick={() => setFin(sumarDias(inicio, 14))}>+2 semanas</button>}</div>
      {creando && sugerencia.nota && <small>{sugerencia.nota}</small>}{consecuencia && <small>{consecuencia}</small>}
      {solape && <small className="aviso-campo">Se solapa con {solape.nombre}</small>}</label>
    <div className="form-sprint__acciones"><button type="button" onClick={cerrar}>Cancelar</button><button className="boton-solido" type="submit">Guardar</button></div>
  </form>;
}
