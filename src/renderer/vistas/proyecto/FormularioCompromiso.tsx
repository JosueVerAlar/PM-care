/**
 * Los tres campos del compromiso: **Quién lo hace · Para cuándo · Qué hay que hacer**.
 *
 * Vocabulario del usuario, no del sistema. Detrás son `responsable`, `fecha_limite` y
 * `descripcion` de la tarea, y se escriben con un único `editarTarea` (regla 9).
 *
 * ## Por qué se escriben en la TAREA y no en el item del sprint
 *
 * `EsquemaItemSprint` guarda los tres campos en `null`, que significa «hereda de la
 * tarea» y no «sin asignar» (ver `compromisoEfectivo`). El valor vigente vive en la
 * tarea; el item solo lo materializa al cerrar el sprint, que a partir de ahí es
 * inmutable (regla 8). Escribir aquí en el item obligaría a un comando nuevo y, peor,
 * sacar la tarea del sprint para redefinirla perdería lo escrito — y ese es un flujo
 * NORMAL del usuario, no un caso raro.
 *
 * ## Las dos salidas, y por qué no son la misma
 *
 * - **Enter o «Listo» = confirmar.** Guarda todo, incluidos los valores por omisión que
 *   el usuario no tocó. Es el gesto de «sí, esos dos están bien»: con la última persona
 *   usada y «fin de sprint» preseleccionados, mover una tarea al sprint cuesta soltar y
 *   pulsar Enter. Diez tareas, veinte interacciones.
 * - **Esc o cerrar = salir.** No aplica los valores por omisión que nadie miró. La
 *   tarjeta se queda con su «Falta quién y para cuándo», que es la verdad.
 *
 * Lo que el usuario SÍ tocó se guarda en el momento de tocarlo, campo por campo, así que
 * ninguna salida descarta nada tecleado (regla 5).
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { compromisoEfectivo } from '../../../compartido/dominio/derivar';
import type { Fecha, ItemSprint, Persona, Tarea } from '../../../compartido/modelo/tipos';
import { useAccionesInterfaz, useInterfaz } from '../../estado/interfaz';
import { useMutar } from '../../estado/mutaciones';
import { fechaCorta } from '../../util/presentacion';

/** Las opciones rápidas de «Para cuándo». `otra` abre el selector de fecha. */
type Cuando = 'fin' | 'hoy' | 'otra' | 'ninguna';

export interface PropsFormularioCompromiso {
  tarea: Tarea;
  /** El item del sprint, si ya existe. Solo se lee: lo que se escribe va a la tarea. */
  item: ItemSprint | undefined;
  personas: readonly Persona[];
  /** Fin del sprint activo: el valor por omisión que casi siempre acierta. */
  finDeSprint: Fecha | null;
  hoy: Fecha;
  /**
   * `avanzar` distingue las dos salidas: confirmar pasa a la fila siguiente del árbol
   * (encadenar diez tareas), salir devuelve el foco a la fila de la que salió.
   */
  cerrar: (avanzar: boolean) => void;
}

export function FormularioCompromiso({
  tarea,
  item,
  personas,
  finDeSprint,
  hoy,
  cerrar,
}: PropsFormularioCompromiso) {
  const mutar = useMutar();
  const { ultimaPersona } = useInterfaz();
  const { recordarPersona } = useAccionesInterfaz();

  const vigente = compromisoEfectivo(
    item ?? { tarea_id: tarea.id, responsable: null, fecha_limite: null, prioridad: null, desenlace: null },
    tarea,
  );

  /**
   * Solo las personas activas pueden recibir trabajo: el reductor rechaza asignar a una
   * desactivada, y ofrecer en el desplegable algo que va a fallar es peor que no
   * ofrecerlo. La que YA es responsable se conserva aunque esté desactivada —si no, el
   * campo mentiría diciendo «sin asignar»— pero deshabilitada.
   */
  const asignables = useMemo(() => personas.filter((p) => p.activa), [personas]);
  const responsableActual = vigente.responsable;
  const inactivaActual = useMemo(
    () =>
      responsableActual !== null && !asignables.some((p) => p.id === responsableActual)
        ? (personas.find((p) => p.id === responsableActual) ?? null)
        : null,
    [asignables, personas, responsableActual],
  );

  // --- valores por omisión ---------------------------------------------
  // Se calculan una sola vez, al montar el formulario para ESTA tarea. Recalcularlos en
  // cada render pisaría lo que el usuario está eligiendo.
  const inicial = useMemo(() => {
    const persona =
      responsableActual ??
      (ultimaPersona !== null && asignables.some((p) => p.id === ultimaPersona) ? ultimaPersona : '');

    let cuando: Cuando;
    let fecha = '';
    if (vigente.fechaLimite !== null) {
      fecha = vigente.fechaLimite;
      cuando =
        vigente.fechaLimite === finDeSprint ? 'fin' : vigente.fechaLimite === hoy ? 'hoy' : 'otra';
    } else {
      cuando = finDeSprint !== null ? 'fin' : 'ninguna';
    }

    return { persona: persona ?? '', cuando, fecha, descripcion: tarea.descripcion ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- instantánea de arranque, a propósito
  }, [tarea.id]);

  const [persona, setPersona] = useState(inicial.persona);
  const [cuando, setCuando] = useState<Cuando>(inicial.cuando);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [descripcion, setDescripcion] = useState(inicial.descripcion);

  const refPersona = useRef<HTMLSelectElement>(null);
  const refCuando = useRef<HTMLSelectElement>(null);
  const refQue = useRef<HTMLTextAreaElement>(null);

  /**
   * El foco arranca en el primer campo FALTANTE, no siempre en el primero: si la tarea ya
   * traía responsable, empezar ahí obliga a saltarlo a mano cada vez.
   */
  useEffect(() => {
    const destino =
      inicial.persona === ''
        ? refPersona.current
        : inicial.cuando === 'ninguna'
          ? refCuando.current
          : refPersona.current;
    // La tarjeta recién comprometida se añade al FINAL de la lista, así que casi siempre
    // nace fuera de la vista. Enfocar el campo ya arrastra el scroll, pero solo lo justo
    // para ese campo: sin esto, el botón «Listo» se queda debajo del borde.
    destino?.closest('.tarjeta')?.scrollIntoView({ block: 'nearest' });
    destino?.focus();
  }, [inicial]);

  // --- traducción a comando --------------------------------------------

  const fechaElegida = (c: Cuando, f: string): Fecha | null => {
    switch (c) {
      case 'fin':
        return finDeSprint;
      case 'hoy':
        return hoy;
      case 'otra':
        return f === '' ? null : f;
      case 'ninguna':
        return null;
    }
  };

  /**
   * Manda solo lo que CAMBIA. `editarTarea` rechaza un comando sin cambios, y campo
   * ausente significa «no tocar» (contrato de `comandos/tipos.ts`), así que un diff vacío
   * no se envía en vez de provocar un aviso que el usuario no causó.
   */
  const guardar = async (parcial: {
    persona?: string;
    cuando?: Cuando;
    fecha?: string;
    descripcion?: string;
  }): Promise<boolean> => {
    const p = parcial.persona ?? persona;
    const c = parcial.cuando ?? cuando;
    const f = parcial.fecha ?? fecha;
    const d = parcial.descripcion ?? descripcion;

    const nuevoResponsable = p === '' ? null : p;
    const nuevaFecha = fechaElegida(c, f);
    const nuevaDescripcion = d.trim() === '' ? null : d.trim();

    const comando: {
      comando: 'editarTarea';
      id: string;
      responsable?: string | null;
      fechaLimite?: Fecha | null;
      descripcion?: string | null;
    } = { comando: 'editarTarea', id: tarea.id };

    if (nuevoResponsable !== tarea.responsable) comando.responsable = nuevoResponsable;
    if (nuevaFecha !== tarea.fecha_limite) comando.fechaLimite = nuevaFecha;
    if (nuevaDescripcion !== tarea.descripcion) comando.descripcion = nuevaDescripcion;

    if (comando.responsable === undefined && comando.fechaLimite === undefined && comando.descripcion === undefined) {
      return true;
    }

    const ok = await mutar(comando, `Compromiso de ${tarea.id}`);
    if (ok && nuevoResponsable !== null) recordarPersona(nuevoResponsable);
    return ok;
  };

  /** Confirmar: aplica también los valores por omisión que nadie tocó, y cierra. */
  const confirmar = async () => {
    // Si el guardado falla, el formulario se queda abierto con lo tecleado dentro y el
    // aviso arriba (regla 5). No se cierra «como si nada».
    if (await guardar({})) cerrar(true);
  };

  const salir = async () => {
    // Lo tocado ya está guardado campo por campo; solo falta el textarea, que guarda al
    // perder el foco y aquí puede no haberlo perdido todavía.
    if ((descripcion.trim() === '' ? null : descripcion.trim()) !== tarea.descripcion) {
      await guardar({});
    }
    cerrar(false);
  };

  const alTeclado = (evento: React.KeyboardEvent) => {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      void salir();
      return;
    }
    if (evento.key !== 'Enter') return;
    // En el textarea, Enter es un salto de línea; se confirma con ⌘Enter.
    if (evento.target === refQue.current && !evento.metaKey) return;
    evento.preventDefault();

    // Encadenado al siguiente campo FALTANTE. «Qué hay que hacer» no cuenta como
    // faltante: casi siempre sobra, y si contara, Enter nunca confirmaría.
    if (persona === '' && evento.target !== refPersona.current) {
      refPersona.current?.focus();
      return;
    }
    if (cuando === 'ninguna' && evento.target !== refCuando.current) {
      refCuando.current?.focus();
      return;
    }
    void confirmar();
  };

  const etiquetaFin = finDeSprint === null ? null : `Fin de sprint (${fechaCorta(finDeSprint)})`;

  return (
    <div
      className="compromiso"
      onKeyDown={alTeclado}
      role="group"
      aria-label={`Compromiso de ${tarea.id}`}
    >
      <div className="compromiso__fila">
        <label className="campo">
          <span className="campo__etq">Quién lo hace</span>
          <select
            ref={refPersona}
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              void guardar({ persona: e.target.value });
            }}
          >
            <option value="">Sin asignar</option>
            {asignables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            {inactivaActual && (
              <option value={inactivaActual.id} disabled>
                {inactivaActual.nombre} (desactivada)
              </option>
            )}
          </select>
        </label>

        <label className="campo">
          <span className="campo__etq">Para cuándo</span>
          <select
            ref={refCuando}
            value={cuando}
            onChange={(e) => {
              const valor = e.target.value as Cuando;
              setCuando(valor);
              // «Otra fecha» todavía no tiene fecha: no se guarda hasta que se elija una.
              if (valor !== 'otra' || fecha !== '') void guardar({ cuando: valor });
            }}
          >
            {etiquetaFin !== null && <option value="fin">{etiquetaFin}</option>}
            <option value="hoy">Hoy ({fechaCorta(hoy)})</option>
            <option value="otra">Otra fecha…</option>
            <option value="ninguna">Sin fecha</option>
          </select>
        </label>

        {cuando === 'otra' && (
          <label className="campo">
            <span className="campo__etq">Qué día</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value);
                if (e.target.value !== '') void guardar({ fecha: e.target.value });
              }}
            />
          </label>
        )}
      </div>

      <label className="campo">
        <span className="campo__etq">Qué hay que hacer</span>
        <textarea
          ref={refQue}
          rows={2}
          value={descripcion}
          placeholder="Opcional. Lo que hay que dejar listo."
          onChange={(e) => setDescripcion(e.target.value)}
          onBlur={() => void guardar({})}
        />
      </label>

      <div className="compromiso__pie">
        <button type="button" className="boton-solido" onClick={() => void confirmar()}>
          Listo
        </button>
        <button type="button" className="boton-texto" onClick={() => void salir()}>
          Salir
        </button>
        <span className="crece" />
        <span className="compromiso__pista">Enter guarda · Esc sale sin aplicar lo que no tocaste</span>
      </div>
    </div>
  );
}
