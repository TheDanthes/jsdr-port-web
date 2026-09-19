import { useState } from 'react';
import { useSesion } from '../sesion';
import { AvisoError } from '../componentes/piezas';

export function Login() {
  const { entrar } = useSesion();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    try {
      await entrar(usuario.trim(), clave);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar');
      setClave('');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="login-pantalla">
      <div className="login-caja">
        <div className="marca-grande">
          <b>jSDR</b>
          <span>Sistema de redacción</span>
        </div>

        <form className="panel" onSubmit={enviar}>
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
          Mismo usuario y contraseña que el sistema de escritorio.<br />
          Esta versión es de <strong>sólo lectura</strong>: no modifica nada.
        </p>
      </div>
    </div>
  );
}
