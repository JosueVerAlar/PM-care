// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DialogoEliminarCerrado } from '../../src/renderer/componentes/DialogoEliminarCerrado';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
});

afterEach(cleanup);

function Caso({ borrar = vi.fn() }: { borrar?: () => void }) {
  const [abierto, setAbierto] = useState(true);
  const origen = useRef<HTMLButtonElement>(null);
  const cancelar = () => {
    setAbierto(false);
    queueMicrotask(() => origen.current?.focus());
  };
  return <>
    <button ref={origen}>SICOE-T14</button>
    {abierto && <DialogoEliminarCerrado id="SICOE-T14" titulo="Captura equivocada" tareas={1}
      sprints={[{ id: 'SICOE-S9', nombre: 'Sprint 9' }]} cancelar={cancelar} confirmar={borrar} />}
  </>;
}

describe('E20 · modal fuerte', () => {
  it('13. es modal y nombra entidad y sprint cerrado', () => {
    render(<Caso />);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(dialogo.textContent).toContain('SICOE-T14');
    expect(dialogo.textContent).toContain('Sprint 9');
    expect(dialogo.textContent).toContain('SICOE-S9');
  });

  it('14. solo la coincidencia exacta habilita borrar', () => {
    render(<Caso />);
    const boton = screen.getByRole('button', { name: 'Borrar definitivamente' });
    const campo = screen.getByRole('textbox');
    for (const texto of ['Confirmar', 'confirmar ', '']) {
      fireEvent.change(campo, { target: { value: texto } });
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(campo, { target: { value: 'confirmar' } });
    expect((boton as HTMLButtonElement).disabled).toBe(false);
  });

  it('15. Escape cancela sin borrar y devuelve el foco al origen', async () => {
    const borrar = vi.fn();
    render(<Caso borrar={borrar} />);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(borrar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'SICOE-T14' }));
  });
});
