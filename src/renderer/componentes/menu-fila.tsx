/** Menú nativo común para las acciones de una fila, con un techo duro de ocho ítems. */

export interface ItemMenuFila<Accion extends string> {
  accion: Accion;
  texto: string;
  /**
   * El atajo que hace lo mismo, si lo hay. `undefined` cuando la acción no tiene tecla.
   *
   * Opcional a propósito: la regla 19 pide la tecla al lado de cada acción PORQUE el menú
   * y el teclado comparten implementación. Donde no hay manejador de teclado —la tarjeta
   * del sprint no lo tiene— anunciar una tecla es prometer un camino que no existe, y eso
   * es peor que no anunciar ninguno.
   */
  tecla?: string;
  grupo: 'hacer' | 'mover' | 'quitar';
}

const GRUPOS = [
  { id: 'hacer', etiqueta: 'Sobre esta fila' },
  { id: 'mover', etiqueta: 'Orden' },
  { id: 'quitar', etiqueta: 'Cuidado' },
] as const;

export function MenuFila<Accion extends string>({
  identificador,
  items,
  ejecutar,
  clase = 'fila__menu',
}: {
  identificador: string;
  items: readonly ItemMenuFila<Accion>[];
  ejecutar: (accion: Accion) => void;
  clase?: string;
}) {
  if (items.length > 8) throw new Error('Un menú de fila no puede tener más de ocho acciones');

  return (
    <select
      className={clase}
      tabIndex={-1}
      value=""
      aria-label={`Acciones de ${identificador}`}
      title={`Acciones de ${identificador}`}
      onClick={(evento) => evento.stopPropagation()}
      onChange={(evento) => {
        const accion = evento.target.value as Accion | '';
        evento.target.value = '';
        if (accion !== '') ejecutar(accion);
      }}
    >
      <option value="">⋯</option>
      {GRUPOS.map((grupo) => {
        const suyos = items.filter((item) => item.grupo === grupo.id);
        if (suyos.length === 0) return null;
        return (
          <optgroup key={grupo.id} label={grupo.etiqueta}>
            {suyos.map((item) => (
              <option key={item.accion} value={item.accion}>
                {item.tecla === undefined ? item.texto : `${item.texto} · ${item.tecla}`}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
