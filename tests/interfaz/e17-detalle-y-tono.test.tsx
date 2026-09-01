// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { indexarTareas } from '../../src/compartido/dominio/derivar';
import { filasDeSprint } from '../../src/compartido/dominio/sprint';
import type { EstadoTarea } from '../../src/compartido/modelo/tipos';
import { TarjetaSprint } from '../../src/renderer/componentes/TarjetaSprint';
import { Glifo } from '../../src/renderer/componentes/iconos';
import { ProveedorAlmacen } from '../../src/renderer/estado/almacen';
import { ProveedorInterfaz, useAccionesInterfaz, useInterfaz } from '../../src/renderer/estado/interfaz';
import { formaDerivada, formaDeTarea, tonoDeTarea } from '../../src/renderer/util/presentacion';
import { HojaDetalle } from '../../src/renderer/vistas/proyecto/HojaDetalle';
import { Leyenda } from '../../src/renderer/vistas/proyecto/Leyenda';
import { unDocumento, unItem, unProyecto, unSprint, unaTarea } from '../apoyo/constructores';

const dobles = vi.hoisted(() => ({ mutar: vi.fn() }));
vi.mock('../../src/renderer/estado/mutaciones', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../src/renderer/estado/mutaciones')>()),
  useMutar: () => dobles.mutar,
}));

afterEach(cleanup);
beforeEach(() => {
  dobles.mutar.mockReset();
  dobles.mutar.mockResolvedValue(true);
});

function datos(estado: EstadoTarea = 'pendiente') {
  const tarea = unaTarea({ clave: 'PM', id: 'PM-T104', titulo: 'Preparar entrega', estado });
  const proyecto = unProyecto({ clave: 'PM', tareas: [tarea] });
  const sprint = unSprint({ id: 'PM-S1', clave: 'PM', items: [unItem(tarea.id)] });
  const documento = unDocumento({ proyectos: [proyecto], sprints: [sprint] });
  return { tarea, proyecto, sprint, documento, fila: filasDeSprint(documento, sprint, '2026-08-31')[0]! };
}

function CasoDesdeSprint() {
  const { tarea, proyecto, sprint, documento, fila } = datos();
  const { detalle } = useInterfaz();
  const { verDetalle } = useAccionesInterfaz();
  return <>
    <TarjetaSprint fila={fila} mostrarProyecto={false} arrastrando={false} acciones={null}
      abrirDetalle={() => verDetalle({ id: tarea.id, clase: 'tarea' })} formulario={null} />
    {detalle !== null && <HojaDetalle documento={documento} proyecto={proyecto} sprint={sprint}
      hoy="2026-08-31" detalle={detalle} indice={indexarTareas(documento)} editable
      cerrar={() => verDetalle(null)} />}
  </>;
}

function montarCaso() {
  return render(<ProveedorAlmacen><ProveedorInterfaz><CasoDesdeSprint /></ProveedorInterfaz></ProveedorAlmacen>);
}

describe('E17 · detalle desde el sprint y tono de en pruebas', () => {
  it('abre el detalle de la tarea cuyo título se activa', () => {
    montarCaso();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar entrega' }));
    expect(screen.getByRole('dialog').textContent).toContain('PM-T104');
  });

  it('conserva la tarjeta arrastrable y su dragstart', () => {
    const { fila } = datos();
    const alIniciarArrastre = vi.fn();
    const { container } = render(<TarjetaSprint fila={fila} mostrarProyecto={false} arrastrando={false}
      acciones={{ editar: vi.fn(), sacar: vi.fn(), alIniciarArrastre }} abrirDetalle={vi.fn()} formulario={null} />);
    const tarjeta = container.querySelector('.tarjeta') as HTMLElement;
    expect(tarjeta.getAttribute('draggable')).toBe('true');
    fireEvent.dragStart(tarjeta);
    expect(alIniciarArrastre).toHaveBeenCalledOnce();
  });

  it('conserva el menú de dos acciones', () => {
    const { fila } = datos();
    const { container } = render(<TarjetaSprint fila={fila} mostrarProyecto={false} arrastrando={false}
      acciones={{ editar: vi.fn(), sacar: vi.fn() }} abrirDetalle={vi.fn()} formulario={null} />);
    expect(screen.getByRole('combobox', { name: 'Acciones de PM-T104' })).toBeTruthy();
    expect(container.querySelectorAll('option')).toHaveLength(3);
  });

  it('cambia el estado correcto desde la hoja abierta por el sprint', () => {
    montarCaso();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar entrega' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Estado de PM-T104' })).getByRole('button', { name: 'Iniciado' }));
    expect(dobles.mutar).toHaveBeenCalledWith(
      { comando: 'cambiarEstado', id: 'PM-T104', estado: 'iniciado' },
      'Iniciado · PM-T104',
    );
  });

  it('da ámbar a en pruebas y conserva azul para iniciado', () => {
    const { container } = render(<>
      <Glifo forma={formaDeTarea('en_pruebas')} etiqueta="En pruebas" tono={tonoDeTarea('en_pruebas')} />
      <Glifo forma={formaDeTarea('iniciado')} etiqueta="Iniciado" tono={tonoDeTarea('iniciado')} />
    </>);
    const glifos = container.querySelectorAll('.glifo');
    expect(glifos[0]?.classList.contains('glifo--tono-pruebas')).toBe(true);
    expect(glifos[1]?.classList.contains('glifo--tono-pruebas')).toBe(false);
  });

  it('no da el tono ámbar a un contenedor en movimiento', () => {
    const { container } = render(<Glifo forma={formaDerivada('en_movimiento')} etiqueta="En movimiento" />);
    expect(container.querySelector('.glifo--curso')).toBeTruthy();
    expect(container.querySelector('.glifo--tono-pruebas')).toBeNull();
  });

  it('declara el token medido en los temas claro y oscuro', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/estilos/base.css'), 'utf8');
    expect(css.match(/--estado-pruebas:/g)).toHaveLength(2);
    expect(css).toContain('--estado-pruebas:    #927005');
    expect(css).toContain('--estado-pruebas:    #FFE08A');
  });

  it('mantiene las siete formas geométricas', () => {
    const fuente = readFileSync(path.resolve(process.cwd(), 'src/renderer/componentes/iconos.tsx'), 'utf8');
    const declaracion = /export type FormaEstado =([\s\S]*?)\n\nexport type TonoGlifo/.exec(fuente)?.[1] ?? '';
    const formas = declaracion.match(/'[a-z]+'/g) ?? [];
    expect(formas).toHaveLength(7);
  });

  it('separa En pruebas y En movimiento con tonos distintos en la leyenda', () => {
    const { container } = render(<Leyenda editable={false} abrirAyuda={() => undefined} />);
    const pruebas = screen.getByTitle('En pruebas');
    const movimiento = screen.getByTitle('En movimiento');
    expect(pruebas.classList.contains('glifo--tono-pruebas')).toBe(true);
    expect(movimiento.classList.contains('glifo--tono-pruebas')).toBe(false);
    expect(container.querySelectorAll('.leyenda__item')).toHaveLength(11);
  });

  it('deja explícitamente sin puerta las tarjetas de vistas que no montan detalle', () => {
    const { fila } = datos();
    render(<TarjetaSprint fila={fila} mostrarProyecto={false} arrastrando={false}
      acciones={null} abrirDetalle={null} formulario={null} />);
    expect(screen.queryByRole('button', { name: 'Preparar entrega' })).toBeNull();
    expect(screen.getByText('Preparar entrega')).toBeTruthy();
  });
});
