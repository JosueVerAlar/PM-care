/**
 * Marcadores de posición de las siete vistas globales.
 *
 * Honestos a propósito: dicen qué pregunta va a responder cada vista, en qué etapa
 * llega, y el único número que ya se puede sostener — el que sale del selector que E10 y
 * E11 van a usar de verdad. No hay gráficas simuladas ni tablas de mentira: una pantalla
 * que finge estar hecha se descubre tarde y cuesta más que una que dice que falta.
 */

import { conteoDeVistaGlobal } from '../../armazon/BarraLateral';
import type { Documento } from '../../../compartido/modelo/tipos';
import type { IdVistaGlobal } from '../../estado/interfaz';

interface Ficha {
  titulo: string;
  pregunta: string;
  /** Cómo se lee el número que ya se puede calcular. */
  unidad: (n: number) => string;
  etapa: string;
}

const FICHAS: Record<IdVistaGlobal, Ficha> = {
  panorama: {
    titulo: 'Panorama',
    pregunta: '¿A cuál de los proyectos le tengo que meter mano hoy? El orden de la lista es el hallazgo.',
    unidad: (n) => `${n} proyecto${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}`,
    etapa: 'E10',
  },
  sprint: {
    titulo: 'Sprint',
    pregunta: 'Todo lo comprometido esta quincena, cruzando los proyectos.',
    unidad: (n) => `${n} tarea${n === 1 ? '' : 's'} en el sprint activo`,
    etapa: 'E8',
  },
  bloqueos: {
    titulo: 'Bloqueos',
    pregunta: '¿Qué está atorado y desde hace cuánto? Ordenado por días bloqueada.',
    unidad: (n) => `${n} tarea${n === 1 ? '' : 's'} bloqueada${n === 1 ? '' : 's'} ahora mismo`,
    etapa: 'E9',
  },
  terminadas: {
    titulo: 'Terminadas',
    pregunta: '¿Qué se cerró y cuándo? Es también una pestaña dentro de cada proyecto.',
    unidad: (n) => `${n} tarea${n === 1 ? '' : 's'} hecha${n === 1 ? '' : 's'}`,
    etapa: 'E10',
  },
  backlog: {
    titulo: 'Backlog del área',
    pregunta: 'Lo abierto que NO está comprometido en el sprint: de aquí sale lo que entra al siguiente.',
    unidad: (n) => `${n} tarea${n === 1 ? '' : 's'} fuera del sprint`,
    etapa: 'E10',
  },
  carga: {
    titulo: 'Carga por persona',
    pregunta: 'Cuánto se le comprometió a cada quien y entre cuántos proyectos está repartido.',
    unidad: (n) => `${n} persona${n === 1 ? '' : 's'} activa${n === 1 ? '' : 's'}`,
    etapa: 'E11',
  },
  equipos: {
    titulo: 'Equipos',
    pregunta: 'Quién está en cada proyecto y quién tiene tareas abiertas sin estar en el equipo.',
    unidad: (n) => `${n} equipo${n === 1 ? '' : 's'}`,
    etapa: 'E11',
  },
};

export function VistaGlobal({ id, documento }: { id: IdVistaGlobal; documento: Documento }) {
  const ficha = FICHAS[id];
  const n = conteoDeVistaGlobal(documento, id);

  return (
    <section className="panel panel--global" aria-label={ficha.titulo}>
      <header className="cab">
        <h2 className="cab__titulo">{ficha.titulo}</h2>
      </header>
      <div className="vacio">
        <p className="vacio__titulo">Esta vista todavía no está construida</p>
        <p className="vacio__nota">{ficha.pregunta}</p>
        {n !== null && (
          <p className="vacio__dato tabular">
            Lo único que ya se puede decir con los datos de hoy: <strong>{ficha.unidad(n)}</strong>.
          </p>
        )}
        <p className="vacio__etapa">Llega en la etapa {ficha.etapa}.</p>
      </div>
    </section>
  );
}
