import { useEffect, useRef, useState } from 'react';
import { api } from '../api/cliente';
import { useEditor } from '../editor/EditorContexto';
import { useSesion } from '../sesion';
import { VERSION } from '../version';
import { useEscape } from './useEscape';

/**
 * "Cambio de contraseña" (CambioPasswordJPanel), con los mensajes y las
 * reglas del Swing: de 6 a 10 caracteres, la repetición igual y distinta de
 * la contraseña por defecto (las controla la API).
 *
 * Dos usos: la pantalla obligatoria de quien entró con la contraseña por
 * defecto (nuevo o blanqueado), que no pide la actual, y el diálogo que
 * cualquiera abre desde la barra para cambiar la suya.
 */
const TITULO = 'Cambio de contraseña';
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

function useCambio(obligatorio: boolean) {
  const ed = useEditor();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repeticion, setRepeticion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async (titulo: string, mensaje: string, porDefecto: 'si' | 'no') =>
    (await ed.preguntar({
      titulo, mensaje,
      botones: [{ etiqueta: 'Si', valor: 'si', principal: porDefecto === 'si' }, { etiqueta: 'No', valor: 'no', principal: porDefecto === 'no' }],
      cancelar: 'no',
    })).boton === 'si';

  /** true si la cambió. */
  async function cambiar(): Promise<boolean> {
    setError(null);
    if (!(await confirmar(TITULO, '¿Quiere cambiar la contraseña?', 'si'))) return false;
    setEnviando(true);
    try {
      const r = await api.cambiarClave({ ...(obligatorio ? {} : { actual }), nueva, repeticion });
      await ed.preguntar({ titulo: TITULO, mensaje: r.mensaje, botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }] });
      return true;
    } catch (e) {
      setError(mensajeDe(e));
      return false;
    } finally {
      setEnviando(false);
    }
  }

  return {
    actual, setActual, nueva, setNueva, repeticion, setRepeticion, error, enviando, cambiar, confirmar,
    escribio: actual !== '' || nueva !== '' || repeticion !== '',
  };
}

function Campos({ c, obligatorio }: { c: ReturnType<typeof useCambio>; obligatorio: boolean }) {
  const primero = useRef<HTMLInputElement>(null);
  useEffect(() => { primero.current?.focus(); }, []);
  return (
    <>
      {!obligatorio && (
        <div className="campo">
          <label htmlFor="clave-actual">Contraseña actual *</label>
          <input
            id="clave-actual" ref={primero} type="password" maxLength={10} autoComplete="current-password"
            value={c.actual} onChange={(e) => c.setActual(e.target.value)}
          />
        </div>
      )}
      <div className="campo">
        <label htmlFor="clave-nueva">Nueva contraseña *</label>
        <input
          id="clave-nueva" ref={obligatorio ? primero : undefined} type="password" maxLength={10} autoComplete="new-password"
          value={c.nueva} onChange={(e) => c.setNueva(e.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor="clave-repeticion">Repetir contraseña nueva *</label>
        <input
          id="clave-repeticion" type="password" maxLength={10} autoComplete="new-password"
          value={c.repeticion} onChange={(e) => c.setRepeticion(e.target.value)}
        />
      </div>
      <p className="chico tenue" style={{ margin: 0 }}>De 6 a 10 caracteres.</p>
      {c.error && <div className="aviso error" role="alert">{c.error}</div>}
    </>
  );
}

/**
 * La pantalla obligatoria: con la contraseña por defecto no se puede hacer
 * nada más. Salir pregunta "¿Desea salir del sistema?", como el Swing.
 */
export function PantallaCambioClave() {
  const { sesion, salir, refrescar } = useSesion();
  const c = useCambio(true);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (await c.cambiar()) await refrescar();
  }

  async function irse() {
    if (await c.confirmar('jSDR - Salir', '¿Desea salir del sistema?', 'no')) salir();
  }

  return (
    <div className="login-pantalla">
      <div className="login-caja">
        <div className="marca-grande">
          <b>jSDR</b>
          <span>{TITULO}</span>
        </div>
        <form className="panel" onSubmit={(e) => void enviar(e)}>
          <div className="aviso info" role="status">
            Debe modificar la contraseña asignada por defecto
            {sesion?.usuario.username && <> (<b>{sesion.usuario.username}</b>)</>}.
          </div>
          <Campos c={c} obligatorio />
          <button type="submit" className="primario" disabled={c.enviando || !c.nueva}>
            {c.enviando ? 'Cambiando…' : 'Aceptar'}
          </button>
          <button type="button" className="plano" onClick={() => void irse()}>Salir</button>
        </form>
        <p className="login-pie"><span className="version">Versión: {VERSION}</span></p>
      </div>
    </div>
  );
}

/** El cambio voluntario, desde la barra. */
export function DialogoCambioClave({ alCerrar }: { alCerrar: () => void }) {
  const c = useCambio(false);
  const ed = useEditor();

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (await c.cambiar()) alCerrar();
  }

  async function cancelar() {
    if (!c.escribio || await c.confirmar(TITULO, '¿Desea cancelar el cambio de contraseña?', 'no')) alCerrar();
  }

  useEscape(() => void cancelar(), ed.dialogoAbierto);

  return (
    <div
      className="dialogo-fondo" role="presentation"
    >
      <form
        className="dialogo panel cambio-clave" role="dialog" aria-modal="true" aria-labelledby="cc-titulo"
        onSubmit={(e) => void enviar(e)}
      >
        <header><h2 id="cc-titulo">{TITULO}</h2></header>
        <div className="dialogo-cuerpo">
          <Campos c={c} obligatorio={false} />
        </div>
        <footer className="acciones">
          <button type="submit" className="primario" disabled={c.enviando || !c.actual || !c.nueva}>
            {c.enviando ? 'Cambiando…' : 'Aceptar'}
          </button>
          <button type="button" disabled={c.enviando} onClick={() => void cancelar()}>Cancelar</button>
        </footer>
      </form>
    </div>
  );
}
