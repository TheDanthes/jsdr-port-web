import { useState } from 'react';
import { useSesion } from '../sesion';
import { ErrorApi } from '../api/cliente';
import { AvisoError } from '../componentes/piezas';
import { Dialogo, type PedidoDialogo } from '../componentes/Dialogo';
import { VERSION } from '../version';

/** "a las 10:42", o "el 09/10 a las 18:05" si no fue hoy. */
function cuando(iso: unknown): string {
  if (typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = (n: number) => String(n).padStart(2, '0');
  const hora = `${dd(d.getHours())}:${dd(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString()
    ? `desde las ${hora}`
    : `desde el ${dd(d.getDate())}/${dd(d.getMonth() + 1)} a las ${hora}`;
}

export function Login() {
  const { entrar, aviso } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  /** "Ya te encontrás logueado. ¿Deseás seguir aquí?" */
  const [pregunta, setPregunta] = useState<PedidoDialogo | null>(null);

  async function intentar(forzar: boolean) {
    setError(null);
    setEntrando(true);
    try {
      await entrar(usuario.trim(), clave, forzar);
    } catch (err) {
      if (!forzar && err instanceof ErrorApi && err.motivo === 'ya_logueado') {
        // Una sola sesión por usuario, como el Swing, pero preguntando.
        const ip = typeof err.cuerpo?.ip === 'string' ? err.cuerpo.ip : null;
        const desde = cuando(err.cuerpo?.desde);
        setPregunta({
          titulo: 'Ya te encontrás logueado',
          mensaje: `Tu usuario tiene una sesión abierta en otro equipo${ip ? ` (IP ${ip}` : ''}`
            + `${ip && desde ? `, ${desde}` : ''}${ip ? ')' : ''}. ¿Deseás seguir aquí?`,
          nota: 'Si seguís aquí, aquella sesión se cierra. Las noticias que tenías abiertas allá '
            + 'quedan para recuperar desde su último autoguardado.',
          botones: [
            { etiqueta: 'Sí', valor: 'si', principal: true },
            { etiqueta: 'No', valor: 'no' },
          ],
          cancelar: 'no',
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
      setClave('');
    } finally {
      setEntrando(false);
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    void intentar(false);
  }

  function responder(boton: string) {
    setPregunta(null);
    if (boton === 'si') void intentar(true);
    else setClave('');   // "No": se queda en el login
  }

  return (
    <div className="login-pantalla">
      <div className="login-caja">
        <div className="marca-grande">
          <b>jSDR</b>
          <span>Sistema de redacción</span>
        </div>

        <form className="panel" onSubmit={enviar}>
          {aviso && !error && <div className="aviso info" role="status">{aviso}</div>}
          {error && <AvisoError>{error}</AvisoError>}

          <div className="campo">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              spellCheck={false}
            />
          </div>

          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input
              id="clave"
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="primario" disabled={entrando || !usuario.trim()}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="login-pie">
          Mismo usuario y contraseña que el sistema de escritorio.
          <span className="version">Versión: {VERSION}</span>
        </p>
      </div>
      {pregunta && <Dialogo pedido={pregunta} alResponder={(r) => responder(r.boton)} />}
    </div>
  );
}
