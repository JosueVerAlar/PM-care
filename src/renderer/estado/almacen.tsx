/**
 * E5 — el documento en el renderer.
 *
 * Dos contextos separados a propósito: uno lleva los DATOS y otro las ACCIONES. Si
 * fueran uno solo, cada instantánea nueva del almacén cambiaría también la identidad del
 * objeto de acciones y volvería a renderizar a todo el que solo quería el botón de
 * reintentar. Las acciones se crean una vez y no cambian nunca.
 *
 * Aquí NO vive nada de interfaz: qué está expandido, qué proyecto se ve y qué filtro está
 * puesto están en `estado/interfaz.tsx`. Mezclarlos haría que colapsar una épica pasara
 * por el mismo reductor que el documento.
 *
 * Este proveedor tampoco calcula nada del dominio. Recibe el documento, lo guarda y lo
 * reparte; el avance y los estados derivados salen de `compartido/dominio/`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import {
  mensajeDeError,
  puente,
  type Comando,
  type Fallo,
  type InstantaneaAlmacen,
  type Respaldo,
  type RespuestaComando,
} from '../puente/api';

/**
 * Las fases son del PUENTE, no del documento. Que el archivo esté roto no es una fase:
 * es `cargado` con `instantanea.modo === 'solo-lectura'`, porque el proceso principal ya
 * lo resolvió y nos mandó el diagnóstico.
 */
export type EstadoAlmacen =
  | { fase: 'cargando' }
  /** No hay `window.pmcare`: la página se abrió fuera de Electron. */
  | { fase: 'sin-puente' }
  /** El puente existe pero la llamada falló. Distinto de «el archivo está roto». */
  | { fase: 'fallo'; mensaje: string }
  | { fase: 'cargado'; instantanea: InstantaneaAlmacen };

type Accion =
  | { tipo: 'cargando' }
  | { tipo: 'sin-puente' }
  | { tipo: 'fallo'; mensaje: string }
  | { tipo: 'instantanea'; instantanea: InstantaneaAlmacen };

function reducir(estado: EstadoAlmacen, accion: Accion): EstadoAlmacen {
  switch (accion.tipo) {
    case 'cargando':
      // Sin este corto, pulsar «Reintentar» hace parpadear la pantalla entera cuando el
      // reintento falla igual: se queda en el estado que ya estaba hasta tener respuesta.
      return estado.fase === 'cargando' ? estado : { fase: 'cargando' };
    case 'sin-puente':
      return { fase: 'sin-puente' };
    case 'fallo':
      return { fase: 'fallo', mensaje: accion.mensaje };
    case 'instantanea':
      return { fase: 'cargado', instantanea: accion.instantanea };
  }
}

/**
 * Lo que el renderer puede pedirle al proceso principal.
 *
 * `aplicar` queda montado desde E5 aunque E6 no lo use: es el camino por el que van a
 * viajar las mutaciones de E7, y tenerlo tipado y con su manejo de error desde ahora
 * evita que la primera escritura de la app se improvise en un `onClick`.
 */
export interface AccionesAlmacen {
  /** Vuelve a pedir el estado actual. No relee el archivo. */
  recargar(): Promise<void>;
  /** Relee el archivo desde cero. Es el botón «Reintentar» del modo solo lectura. */
  reintentar(): Promise<void>;
  respaldos(): Promise<Respaldo[]>;
  restaurar(nombre: string): Promise<RespuestaComando>;
  abrirEnEditor(): Promise<string | null>;
  revelar(): Promise<string | null>;
  aplicar(comando: Comando): Promise<RespuestaComando>;
  deshacer(): Promise<RespuestaComando>;
  guardarAhora(): Promise<void>;
}

const ContextoAlmacen = createContext<EstadoAlmacen | null>(null);
const ContextoAcciones = createContext<AccionesAlmacen | null>(null);

const SIN_PUENTE: Fallo = {
  ok: false,
  codigo: 'sin-puente',
  mensaje: 'La app no está conectada al proceso principal.',
};

export function ProveedorAlmacen({ children }: { children: ReactNode }) {
  const [estado, despachar] = useReducer(reducir, { fase: 'cargando' });

  /**
   * `despachar` es estable, pero el efecto de montaje corre dos veces en `StrictMode` y
   * una respuesta tardía del primer montaje no debe pisar el estado del segundo.
   */
  const vivo = useRef(true);

  const acciones = useMemo<AccionesAlmacen>(() => {
    const publicar = (instantanea: InstantaneaAlmacen) => {
      if (vivo.current) despachar({ tipo: 'instantanea', instantanea });
    };
    const fallar = (error: unknown) => {
      if (vivo.current) despachar({ tipo: 'fallo', mensaje: mensajeDeError(error) });
    };

    return {
      async recargar() {
        const api = puente();
        if (!api) return despachar({ tipo: 'sin-puente' });
        try {
          publicar(await api.cargar());
        } catch (error) {
          fallar(error);
        }
      },

      async reintentar() {
        const api = puente();
        if (!api) return despachar({ tipo: 'sin-puente' });
        despachar({ tipo: 'cargando' });
        try {
          publicar(await api.reintentar());
        } catch (error) {
          fallar(error);
        }
      },

      async respaldos() {
        const api = puente();
        if (!api) return [];
        try {
          return await api.respaldos();
        } catch {
          // La lista de respaldos es informativa: si falla, la pantalla dice «no hay» y
          // las otras tres acciones de recuperación siguen disponibles.
          return [];
        }
      },

      async restaurar(nombre) {
        const api = puente();
        if (!api) return SIN_PUENTE;
        try {
          const respuesta = await api.restaurar(nombre);
          if (respuesta.ok) publicar(respuesta.instantanea);
          return respuesta;
        } catch (error) {
          return { ok: false, codigo: 'error-interno', mensaje: mensajeDeError(error) };
        }
      },

      /** Devuelve el mensaje de error, o `null` si salió bien. */
      async abrirEnEditor() {
        const api = puente();
        if (!api) return SIN_PUENTE.mensaje;
        try {
          const resultado = await api.abrirEnEditor();
          return resultado.ok ? null : resultado.mensaje;
        } catch (error) {
          return mensajeDeError(error);
        }
      },

      async revelar() {
        const api = puente();
        if (!api) return SIN_PUENTE.mensaje;
        try {
          const resultado = await api.revelar();
          return resultado.ok ? null : resultado.mensaje;
        } catch (error) {
          return mensajeDeError(error);
        }
      },

      async aplicar(comando) {
        const api = puente();
        if (!api) return SIN_PUENTE;
        try {
          const respuesta = await api.aplicar(comando);
          if (respuesta.ok) publicar(respuesta.instantanea);
          return respuesta;
        } catch (error) {
          return { ok: false, codigo: 'error-interno', mensaje: mensajeDeError(error) };
        }
      },

      async deshacer() {
        const api = puente();
        if (!api) return SIN_PUENTE;
        try {
          const respuesta = await api.deshacer();
          if (respuesta.ok) publicar(respuesta.instantanea);
          return respuesta;
        } catch (error) {
          return { ok: false, codigo: 'error-interno', mensaje: mensajeDeError(error) };
        }
      },

      async guardarAhora() {
        const api = puente();
        if (!api) return;
        try {
          await api.guardarAhora();
        } catch {
          // El aviso de un guardado fallido llega por `alCambiarEstado`, que sí trae el
          // diagnóstico completo. Aquí tragárselo evita reportar el mismo fallo dos veces.
        }
      },
    };
  }, []);

  // Carga inicial y suscripción a los avisos que el proceso principal empuja solo:
  // cambio externo del archivo, conflicto, guardado fallido. Sin esto la app se entera
  // de que alguien editó el JSON por fuera solo si el usuario recarga.
  useEffect(() => {
    vivo.current = true;
    const api = puente();
    if (!api) {
      despachar({ tipo: 'sin-puente' });
      return () => {
        vivo.current = false;
      };
    }

    const desuscribir = api.alCambiarEstado((instantanea) => {
      if (vivo.current) despachar({ tipo: 'instantanea', instantanea });
    });
    void acciones.recargar();

    return () => {
      vivo.current = false;
      desuscribir();
    };
  }, [acciones]);

  return (
    <ContextoAcciones.Provider value={acciones}>
      <ContextoAlmacen.Provider value={estado}>{children}</ContextoAlmacen.Provider>
    </ContextoAcciones.Provider>
  );
}

export function useAlmacen(): EstadoAlmacen {
  const estado = useContext(ContextoAlmacen);
  if (estado === null) throw new Error('useAlmacen fuera de <ProveedorAlmacen>');
  return estado;
}

export function useAccionesAlmacen(): AccionesAlmacen {
  const acciones = useContext(ContextoAcciones);
  if (acciones === null) throw new Error('useAccionesAlmacen fuera de <ProveedorAlmacen>');
  return acciones;
}
