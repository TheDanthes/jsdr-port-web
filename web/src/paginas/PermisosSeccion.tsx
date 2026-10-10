import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente';
import { NIVELES, type InicioPermisosSeccion, type UsuarioDeSeccion } from '../api/tipos';
import { useEditor } from '../editor/EditorContexto';
import { useSesion } from '../sesion';
import { AvisoError, Cargando } from '../componentes/piezas';
import { useEscape } from '../componentes/useEscape';

/**
 * Administración → Permisos/Sección. Port de AdministradorPermisosSeccionJPanel
 * ("Asignación de Permisos en Sección") y de su editor, con las mismas
 * confirmaciones y mensajes.
 *
 * Se elige la sección (un jefe sólo tiene la suya por defecto; un secretario,
 * todas las suyas), aparecen sus usuarios, y al elegir uno se tildan sus
 * permisos en esa sección. Suma, respecto del Swing, ver en la lista qué
 * permisos tiene cada uno sin tener que abrirlo.
 */
const TITULO = 'Asignación de Permisos en Sección';
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PermisosSeccion() {
  const [params, setParams] = useSearchParams();
  const [inicio, setInicio] = useState<InicioPermisosSeccion | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioDeSeccion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<UsuarioDeSeccion | null>(null);
  const edicion = useSesion().sesion?.edicion === true;

  // La sección elegida vive en la URL (se puede volver atrás y compartir).
  const pedida = Number(params.get('seccion')) || null;
  const seccion = inicio?.secciones.find((s) => s.id === pedida) ?? inicio?.secciones[0] ?? null;

  useEffect(() => {
    api.permisosSeccion.iniciar().then(setInicio).catch((e) => setError(mensajeDe(e)));
  }, []);

  const idSeccion = seccion?.id ?? null;
  const [recargar, setRecargar] = useState(0);
  useEffect(() => {
    if (!idSeccion) return;
    let vivo = true;
    setUsuarios(null);
    api.permisosSeccion.usuarios(idSeccion)
      .then((u) => { if (vivo) setUsuarios(u); })
      .catch((e) => { if (vivo) setError(mensajeDe(e)); });
    return () => { vivo = false; };
  }, [idSeccion, recargar]);

  const nombrePermiso = (id: number) => {
    const p = inicio?.permisos.find((x) => x.id === id);
    return p ? p.descripcion || p.nombre : `#${id}`;
  };

  return (
    <div className="panel permisos-seccion">
      <header>
        <h2>
          <Link to="/administracion" className="tenue" style={{ fontWeight: 400 }}>Administración</Link>
          {' › '}Permisos/Sección
        </h2>
        <span className="chico tenue">{TITULO}</span>
      </header>

      {error && <AvisoError>{error}</AvisoError>}
      {aviso && <div className="aviso info" role="status">{aviso}</div>}
      {!edicion && inicio && (
        <div className="aviso">Esta instalación es de sólo lectura: se ven los permisos pero no se pueden cambiar.</div>
      )}

      {!inicio && !error && <Cargando que="Cargando secciones" />}

      {inicio && (
        <>
          <h3 className="separador">Filtro</h3>
          <div className="permisos-filtro">
            <label htmlFor="ps-seccion">Sección</label>
            <select
              id="ps-seccion" value={seccion?.id ?? ''}
              onChange={(e) => { setAviso(null); setParams({ seccion: e.target.value }, { replace: true }); }}
            >
              {inicio.secciones.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre ?? s.codigo ?? s.id}</option>
              ))}
            </select>
            {inicio.secciones.length === 1 && (
              <span className="chico tenue">Como jefe, asigna permisos sólo en su sección por defecto.</span>
            )}
          </div>

          <h3 className="separador">Usuarios</h3>
          {!usuarios && !error && <Cargando que="Buscando usuarios" />}
          {usuarios && (
            <div className="tabla-marco">
              <table className="lista permisos-tabla">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Nombre y Apellido</th>
                    <th>Nivel</th>
                    <th>Permisos en la sección</th>
                    <th title="Sección por defecto del usuario"><span className="sr">Sección por defecto</span>★</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 && (
                    <tr><td colSpan={5} className="tenue">No hay usuarios en esta sección.</td></tr>
                  )}
                  {usuarios.map((u) => (
                    <tr
                      key={u.id} className={`clicable${u.habilitado === false ? ' deshabilitado' : ''}`}
                      tabIndex={0}
                      onClick={() => { setAviso(null); setEditando(u); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { setAviso(null); setEditando(u); } }}
                    >
                      <td><b>{u.username}</b>{u.habilitado === false && <span className="tenue chico"> (deshabilitado)</span>}</td>
                      <td>{u.nombre_apellido ?? '—'}</td>
                      <td>{u.nivel !== null ? NIVELES[u.nivel] ?? u.nivel : '—'}</td>
                      <td>
                        {u.permisos.length === 0
                          ? <span className="tenue">ninguno</span>
                          : u.permisos.map((p) => <span key={p} className="etiqueta permiso">{nombrePermiso(p)}</span>)}
                      </td>
                      <td className="default" title={u.es_default ? 'Es su sección por defecto' : undefined}>
                        {u.es_default ? '★' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="chico tenue permisos-pie">
            Elegí un usuario para asignarle permisos. ★ = es su sección por defecto.
            Los cambios valen en el acto, también para quien ya está conectado.
          </p>
        </>
      )}

      {editando && seccion && inicio && (
        <EditorPermisos
          usuario={editando} seccion={seccion.nombre ?? String(seccion.id)} idSeccion={seccion.id}
          permisos={inicio.permisos} soloLectura={!edicion}
          alTerminar={(cambio) => {
            setEditando(null);
            if (cambio) { setAviso(`Los permisos de ${editando.username} se actualizaron correctamente`); setRecargar((n) => n + 1); }
          }}
        />
      )}
    </div>
  );
}

/** EditorPermisosSeccionJPanel, en un diálogo como el del Swing. */
function EditorPermisos({
  usuario, seccion, idSeccion, permisos, soloLectura, alTerminar,
}: {
  usuario: UsuarioDeSeccion;
  seccion: string;
  idSeccion: number;
  permisos: InicioPermisosSeccion['permisos'];
  soloLectura: boolean;
  alTerminar: (cambio: boolean) => void;
}) {
  const [tildados, setTildados] = useState(() => new Set(usuario.permisos));
  const [guardando, setGuardando] = useState(false);
  const ed = useEditor();
  const caja = useRef<HTMLDivElement>(null);
  const cambio = tildados.size !== usuario.permisos.length || usuario.permisos.some((p) => !tildados.has(p));

  useEffect(() => { caja.current?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus(); }, []);

  const confirmar = async (mensaje: string, porDefecto: 'si' | 'no') =>
    (await ed.preguntar({
      titulo: TITULO, mensaje,
      botones: [{ etiqueta: 'Si', valor: 'si', principal: porDefecto === 'si' }, { etiqueta: 'No', valor: 'no', principal: porDefecto === 'no' }],
      cancelar: 'no',
    })).boton === 'si';

  async function aceptar() {
    if (soloLectura || !cambio) { alTerminar(false); return; }
    if (!(await confirmar('¿Quiere actualizar los permisos del usuario?', 'si'))) return;
    setGuardando(true);
    try {
      await api.permisosSeccion.actualizar(idSeccion, usuario.id, [...tildados]);
      alTerminar(true);
    } catch (e) {
      await ed.preguntar({ titulo: TITULO, mensaje: mensajeDe(e), botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }] });
    } finally {
      setGuardando(false);
    }
  }

  async function cancelar() {
    // El Swing preguntaba siempre; acá, sólo si hay algo que perder.
    if (!cambio || soloLectura || await confirmar('¿Desea cancelar la asignación?', 'no')) alTerminar(false);
  }

  function alternar(id: number) {
    setTildados((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  useEscape(() => void cancelar(), ed.dialogoAbierto);

  return (
    <div
      className="dialogo-fondo" role="presentation"
    >
      <div className="dialogo panel permisos-editor" role="dialog" aria-modal="true" aria-labelledby="ps-titulo" ref={caja}>
        <header><h2 id="ps-titulo">{TITULO}</h2></header>
        <div className="dialogo-cuerpo">
          <dl className="permisos-datos">
            <dt>Sección</dt><dd>{seccion}</dd>
            <dt>Usuario</dt><dd><b>{usuario.username}</b>{usuario.habilitado === false && <span className="tenue"> (deshabilitado)</span>}</dd>
            <dt>Nombre/Apellido</dt><dd>{usuario.nombre_apellido ?? '—'}</dd>
            <dt>DNI</dt><dd>{usuario.dni ?? '—'}</dd>
            <dt>Nivel</dt><dd>{usuario.nivel !== null ? NIVELES[usuario.nivel] ?? usuario.nivel : '—'}</dd>
          </dl>
          <h3 className="separador chico">Permisos</h3>
          <ul className="permisos-lista">
            {permisos.map((p) => (
              <li key={p.id}>
                <label>
                  <input
                    type="checkbox" checked={tildados.has(p.id)} disabled={soloLectura || guardando}
                    onChange={() => alternar(p.id)}
                  />
                  <span>
                    <b>{p.nombre}</b>
                    {p.descripcion && <small className="tenue">{p.descripcion}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <footer className="acciones">
          <button type="button" className="primario" disabled={guardando} onClick={() => void aceptar()}>
            {guardando ? 'Guardando…' : 'Aceptar'}
          </button>
          <button type="button" disabled={guardando} onClick={() => void cancelar()}>Cancelar</button>
        </footer>
      </div>
    </div>
  );
}
