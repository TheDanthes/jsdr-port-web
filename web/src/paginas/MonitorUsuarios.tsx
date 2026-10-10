import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { NIVELES, type MonitorUsuarios as Datos, type NoticiaEnMonitor } from '../api/tipos';
import { AvisoError, Cargando, lineaTitular } from '../componentes/piezas';

/**
 * Administración → Monitor de Usuarios. Port de MonitorUsuariosJPanel: la
 * tabla "Usuarios en Sesión", que se actualiza sola cada 5 segundos, con los
 * que dan señales en verde y los que dejaron de darlas en rojo.
 *
 * Suma lo que el Swing guardaba pero no mostraba (desde cuándo está cada uno)
 * y lo que pidió la redacción: qué noticia tiene abierta en el editor.
 */
const CADA_MS = 5_000;   // refreshTimer del Swing: 5000 ms

/** Mensaje del Swing cuando falla la actualización (gui.actualizarusuarioslogueados.error). */
const ERROR_ACTUALIZAR = 'Se ha producido un error al actualizar los usuarios en sesion';

const dosDigitos = (n: number) => String(n).padStart(2, '0');

function horaDe(iso: string, ahora: Date) {
  const d = new Date(iso);
  const hm = `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  return d.toDateString() === ahora.toDateString() ? hm : `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)} ${hm}`;
}

/** "45 s", "12 min", "3 h 05 min". */
function lapso(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return 'un instante';
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${dosDigitos(min % 60)} min`;
}

function Noticia({ n }: { n: NoticiaEnMonitor }) {
  if (n.confidencial) return <span className="tenue">una noticia confidencial</span>;
  const titulo = n.titulo || lineaTitular(n.titular) || '(sin título)';
  return (
    <Link to={`/noticias/${n.id}`} className="monitor-noticia">
      {n.seccion_codigo && <span className="tenue">{n.seccion_codigo} · </span>}
      <b>{n.guia ?? '(sin guía)'}</b> <span className="tenue">v{n.numero}</span>
      <br />
      <span className="chico">{titulo}</span>
    </Link>
  );
}

export function MonitorUsuarios() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const actualizar = useCallback(async () => {
    try {
      setDatos(await api.monitorUsuarios());
      setActualizado(new Date());
      setError(null);
    } catch (e) {
      // Como el Swing: el mensaje de la regla si lo hay (sin permiso), y si no
      // el genérico. Lo último que se vio queda en pantalla.
      setError(e instanceof ErrorApi && e.codigo === 403 ? e.message : ERROR_ACTUALIZAR);
    }
  }, []);

  useEffect(() => {
    void actualizar();
    // Con la pestaña oculta no tiene sentido preguntar cada 5 segundos: al
    // volver a mirarla se actualiza en el acto.
    const t = window.setInterval(() => { if (!document.hidden) void actualizar(); }, CADA_MS);
    const alVolver = () => { if (!document.hidden) void actualizar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [actualizar]);

  const ahora = datos ? new Date(datos.ahora) : new Date();
  const vivos = datos?.usuarios.filter((u) => u.vivo).length ?? 0;
  const colgados = (datos?.usuarios.length ?? 0) - vivos;

  return (
    <div className="panel monitor">
      <header>
        <h2>
          <Link to="/administracion" className="tenue" style={{ fontWeight: 400 }}>Administración</Link>
          {' › '}Monitor de Usuarios
        </h2>
        {datos && (
          <span className="chico tenue" aria-live="polite">
            {vivos} en línea{colgados > 0 && ` · ${colgados} sin señal`}
            {actualizado && ` · actualizado ${actualizado.toLocaleTimeString('es-AR')}`}
          </span>
        )}
      </header>

      {error && <AvisoError>{error}</AvisoError>}

      <h3 className="separador">Usuarios en Sesión</h3>

      {!datos && !error && <Cargando que="Buscando usuarios en sesión" />}

      {datos && (
        <div className="tabla-marco">
          <table className="lista monitor-tabla">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>IP</th>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Desde</th>
                <th>Última señal</th>
                <th>Noticia abierta</th>
              </tr>
            </thead>
            <tbody>
              {datos.usuarios.length === 0 && (
                <tr><td colSpan={7} className="tenue">No hay nadie en sesión.</td></tr>
              )}
              {datos.usuarios.map((u) => (
                <tr key={`${u.username}-${u.inicio}-${u.ip}`} className={u.vivo ? 'vivo' : 'colgado'}>
                  <td className="estado-conexion">
                    <span className="punto" aria-hidden="true" />
                    <b>{u.username}</b>
                    <span className="sr">{u.vivo ? ' (en línea)' : ' (sin señal)'}</span>
                  </td>
                  <td className="estado-conexion">{u.ip}</td>
                  <td>{u.nombre_apellido ?? '—'}</td>
                  <td>{u.nivel !== null ? NIVELES[u.nivel] ?? u.nivel : '—'}</td>
                  <td title={new Date(u.inicio).toLocaleString('es-AR')}>
                    {horaDe(u.inicio, ahora)}
                    <span className="tenue chico"> ({lapso(ahora.getTime() - Date.parse(u.inicio))})</span>
                  </td>
                  <td title={new Date(u.ultima).toLocaleString('es-AR')}>
                    hace {lapso(ahora.getTime() - Date.parse(u.ultima))}
                  </td>
                  <td>
                    {u.noticias.length === 0
                      ? <span className="tenue">—</span>
                      : u.noticias.map((n, i) => <div key={i}><Noticia n={n} /></div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="chico tenue monitor-leyenda">
        <li>
          <span className="vivo"><span className="punto" aria-hidden="true" />En línea</span>: dio señales en
          los últimos minutos (la web avisa una vez por minuto, aunque no se toque nada).
        </li>
        <li>
          <span className="colgado"><span className="punto" aria-hidden="true" />Sin señal</span>: cerró el
          navegador sin <b>Salir</b> o se le colgó la PC. Deja de figurar cuando vuelve a entrar o cuando vence
          su sesión.
        </li>
        <li>Sólo aparecen los que usan la web: los que siguen en el jSDR de escritorio, no.</li>
      </ul>
    </div>
  );
}
