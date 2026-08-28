// @vitest-environment jsdom
/**
 * La puerta de la retrospectiva sigue la guarda inversa del comando: solo existe para
 * cerrados. La prueba mira el contrato accesible, no las clases que le dan forma.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RetrospectivaSprint } from '../../src/renderer/componentes/RetrospectivaSprint';
import { unSprint } from '../apoyo/constructores';

const dobles = vi.hoisted(() => ({ mutar: vi.fn() }));
vi.mock('../../src/renderer/estado/mutaciones', () => ({
  useMutar: () => dobles.mutar,
  useSoloLectura: () => false,
}));

afterEach(cleanup);
beforeEach(() => {
  dobles.mutar.mockReset();
  dobles.mutar.mockResolvedValue(true);
});

function montar(sprint: ReturnType<typeof unSprint>) {
  return render(<RetrospectivaSprint sprint={sprint} />);
}

describe('retrospectiva del sprint', () => {
  it('un sprint cerrado sin retro ofrece escribirla', () => {
    montar(unSprint({ estado: 'cerrado', retrospectiva: null }));
    expect(screen.getByRole('button', { name: 'Escribir retrospectiva' })).toBeTruthy();
  });

  it('un sprint cerrado con retro la muestra', () => {
    montar(unSprint({ estado: 'cerrado', retrospectiva: 'Probar antes con datos reales.' }));
    expect(screen.getByText('Probar antes con datos reales.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar retrospectiva' })).toBeTruthy();
  });

  it.each(['activo', 'planeado'] as const)('un sprint %s no ofrece el control', (estado) => {
    const { container } = montar(unSprint({ estado, retrospectiva: null }));
    expect(container.childElementCount).toBe(0);
    expect(screen.queryByRole('button', { name: /retrospectiva/i })).toBeNull();
  });

  /**
   * La que más importa de las tres: sobre un sprint abierto el comando se RECHAZA, así
   * que ofrecer el control enseñaría que la app está rota en vez de que la retro todavía
   * no toca. Un control que siempre falla es peor que ningún control.
   */
  it('un sprint abierto no ofrece el control, ni activo ni planeado', () => {
    for (const estado of ['activo', 'planeado'] as const) {
      const { container } = montar(unSprint({ id: 'UNO-S1', clave: 'UNO', estado }));
      expect(container.textContent, estado).not.toMatch(/etrospectiva/);
      cleanup();
    }
  });

  it('el guardado explícito envía el último texto visible', () => {
    const sprint = unSprint({ estado: 'cerrado', retrospectiva: null });
    montar(sprint);
    fireEvent.click(screen.getByRole('button', { name: 'Escribir retrospectiva' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Retrospectiva' }), {
      target: { value: 'Separar antes los casos de prueba.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar retrospectiva' }));

    expect(dobles.mutar).toHaveBeenCalledWith(
      {
        comando: 'escribirRetrospectiva',
        sprintId: sprint.id,
        texto: 'Separar antes los casos de prueba.',
      },
      `Retrospectiva de ${sprint.nombre}`,
    );
  });
});
