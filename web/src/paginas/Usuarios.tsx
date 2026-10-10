import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { NIVELES, type CatalogosUsuarios, type DatosUsuarioAdmin, type UsuarioAdmin } from '../api/tipos';
import { useEditor } from '../editor/EditorContexto';
import { useSesion } from '../sesion';
import { AvisoError, Cargando } from '../componentes/piezas';
import { useEscape } from '../componentes/useEscape';

/**
 * Administración → Usuarios. Port de AdministradorUsuariosJPanel y de su
 * editor (EditorUsuarioJPanel), con las mismas confirmaciones y mensajes.
 *
 * El blanqueo deja la contraseña por defecto (123456) y lo dice bien a la
 * vista, para que quien lo hizo sepa qué pasarle al usuario.
 */
const TITULO = 'Administración de Usuarios';
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Usuarios() {
  const [cat, setCat] = useState<CatalogosUsuarios | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState({ username: '', nombre: '', nivel: 0 });
  const [recargar, setRecargar] = useState(0);
  const [editando, setEditando] = useState<UsuarioAdmin | 'nuevo' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const edicion = useSesion().sesion?.edicion === true;

  useEffect(() => { api.usuariosAdmin.catalogos().then(setCat).catch((e) => setError(mensajeDe(e))); }, []);

  // Busca mientras se escribe, con una pausa corta.
  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(() => {
      api.usuariosAdmin.buscar({ username: filtro.username, nombre: filtro.nombre, nivel: filtro.nivel || undefined })
        .then((u) => { if (vivo) { setUsuarios(u); setError(null); } })
        .catch((e) => { if (vivo) setError(mensajeDe(e)); });
    }, 250);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [filtro, recargar]);

  const seccion = (id: number) => cat?.secciones.find((s) => s.id === id);
  const permiso = (id: number) => cat?.permisos.find((p) => p.id === id);

  function terminar(mensaje: string | null) {
    setEditando(null);
    if (mensaje) { setAviso(mensaje); setRecargar((n) => n + 1); }
  }

  return (
    <div className="panel usuarios-admin">
      <header>
        <h2>
          <Link to="/administracion" className="tenue" style={{ fontWeight: 400 }}>Administración</Link>
          {' › '}Usuarios
        </h2>
        {edicion && cat && (
          <button type="button" className="primario" onClick={() => { setAviso(null); setEditando('nuevo'); }}>
            Agregar
          </button>
        )}
      </header>

      {error && <AvisoError>{error}</AvisoError>}
      {aviso && <div className="aviso info" role="status">{aviso}</div>}

      <h3 className="separador">Filtro</h3>
      <div className="usuarios-filtro">
        <label>
          Usuario
          <input
            type="search" value={filtro.username} spellCheck={false}
            onChange={(e) => setFiltro((f) => ({ ...f, username: e.target.value }))}
          />
        </label>
        <label>
          Nombre/apellido
          <input
            type="search" value={filtro.nombre} spellCheck={false}
            onChange={(e) => setFiltro((f) => ({ ...f, nombre: e.target.value }))}
          />
        </label>
        <label>
          Nivel
          <select value={filtro.nivel} onChange={(e) => setFiltro((f) => ({ ...f, nivel: Number(e.target.value) }))}>
            <option value={0}>Todos</option>
            {Object.entries(NIVELES).map(([n, nombre]) => <option key={n} value={n}>{nombre}</option>)}
          </select>
        </label>
      </div>

      <h3 className="separador">Usuarios{usuarios && <span className="tenue"> ({usuarios.length})</span>}</h3>
      {!usuarios && !error && <Cargando que="Buscando usuarios" />}
      {usuarios && (
        <div className="tabla-marco">
          <table className="lista usuarios-tabla">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre y Apellido</th>
                <th>Nivel</th>
                <th>Secciones</th>
                <th>Permisos</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 && (
                <tr><td colSpan={6} className="tenue">No hay usuarios que coincidan.</td></tr>
              )}
              {usuarios.map((u) => (
                <tr
                  key={u.id} tabIndex={0}
                  className={`clicable${u.habilitado === false ? ' deshabilitado' : ''}`}
                  onClick={() => { setAviso(null); setEditando(u); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { setAviso(null); setEditando(u); } }}
                >
                  <td><b>{u.username}</b></td>
                  <td>{u.nombre_apellido ?? '—'}</td>
                  <td>{u.nivel !== null ? NIVELES[u.nivel] ?? u.nivel : '—'}</td>
                  <td className="chico">
                    {u.secciones.length === 0 ? <span className="tenue">—</span> : u.secciones.map((id) => {
                      const s = seccion(id);
                      const def = id === u.seccion_default;
                      return (
                        <span key={id} className={`seccion-chip${def ? ' por-defecto' : ''}`} title={`${s?.nombre ?? id}${def ? ' (por defecto)' : ''}`}>
                          {s?.codigo ?? s?.nombre ?? id}{def && '★'}
                        </span>
                      );
                    })}
                  </td>
                  <td>
                    {u.permisos.map((id) => (
                      <span key={id} className="etiqueta permiso">{permiso(id)?.descripcion ?? permiso(id)?.nombre ?? id}</span>
                    ))}
                  </td>
                  <td className="chico">
                    {u.habilitado === false && <span className="etiqueta">Deshabilitado</span>}
                    {u.clave_por_defecto && (
                      <span className="etiqueta clave-defecto" title="Todavía no cambió la contraseña por defecto">
                        Contraseña {cat?.clave_por_defecto ?? 'por defecto'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="chico tenue usuarios-pie">
        Elegí un usuario para editarlo, blanquearle la contraseña o eliminarlo. ★ = sección por defecto.
        Los permisos de cada sección (redactar, fotocomponer) se asignan en{' '}
        <Link to="/administracion/permisos-seccion">Permisos/Sección</Link>.
      </p>

      {editando && cat && (
        <EditorUsuario
          usuario={editando === 'nuevo' ? null : editando} cat={cat} soloLectura={!edicion}
          alTerminar={terminar}
        />
      )}
    </div>
  );
}

/** EditorUsuarioJPanel, en un diálogo como el del Swing. */
function EditorUsuario({
  usuario, cat, soloLectura, alTerminar,
}: {
  usuario: UsuarioAdmin | null;
  cat: CatalogosUsuarios;
  soloLectura: boolean;
  /** Con mensaje: hubo un cambio (se vuelve a buscar). */
  alTerminar: (mensaje: string | null) => void;
}) {
  const creando = usuario === null;
  const titulo = `${TITULO} - ${creando ? 'Creación' : 'Edición'}`;
  const inicial: DatosUsuarioAdmin = {
    username: usuario?.username ?? '',
    nombre_apellido: usuario?.nombre_apellido ?? '',
    dni: usuario?.dni ?? '',
    nivel: usuario?.nivel ?? 10,
    habilitado: usuario?.habilitado !== false,
    permisos: usuario?.permisos ?? [],
    secciones: usuario?.secciones ?? [],
    seccion_default: usuario?.seccion_default ?? null,
  };
  const [d, setD] = useState<DatosUsuarioAdmin>(inicial);
  const [ocupado, setOcupado] = useState(false);
  const ed = useEditor();
  const yo = useSesion().sesion?.usuario.id;
  const primero = useRef<HTMLInputElement>(null);
  const cambio = JSON.stringify(d) !== JSON.stringify(inicial);

  useEffect(() => { primero.current?.focus(); }, []);

  const confirmar = async (mensaje: string, porDefecto: 'si' | 'no', nota?: string) =>
    (await ed.preguntar({
      titulo, mensaje, nota,
      botones: [{ etiqueta: 'Si', valor: 'si', principal: porDefecto === 'si' }, { etiqueta: 'No', valor: 'no', principal: porDefecto === 'no' }],
      cancelar: 'no',
    })).boton === 'si';
  const informar = (p: { titulo?: string; mensaje: string; destacado?: string; nota?: string; detalles?: string[] }) =>
    ed.preguntar({ titulo: p.titulo ?? titulo, ...p, botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }], cancelar: 'ok' });
  const informarError = (e: unknown) =>
    informar(e instanceof ErrorApi && e.errores.length > 1
      ? { mensaje: 'Revise los datos del usuario:', detalles: e.errores }
      : { mensaje: mensajeDe(e) });

  const cambiar = <K extends keyof DatosUsuarioAdmin>(k: K, v: DatosUsuarioAdmin[K]) => setD((x) => ({ ...x, [k]: v }));

  function alternarPermiso(id: number) {
    cambiar('permisos', d.permisos.includes(id) ? d.permisos.filter((x) => x !== id) : [...d.permisos, id]);
  }
  function alternarSeccion(id: number) {
    setD((x) => {
      const tiene = x.secciones.includes(id);
      const secciones = tiene ? x.secciones.filter((s) => s !== id) : [...x.secciones, id];
      // La primera que se agrega queda por defecto; si se quita la de por defecto, no queda ninguna.
      const seccion_default = tiene
        ? (x.seccion_default === id ? null : x.seccion_default)
        : (x.seccion_default ?? id);
      return { ...x, secciones, seccion_default };
    });
  }

  async function aceptar() {
    if (soloLectura || (!creando && !cambio)) { alTerminar(null); return; }
    if (!(await confirmar(creando ? '¿Quiere crear el usuario?' : '¿Quiere actualizar el usuario?', 'si'))) return;
    setOcupado(true);
    try {
      if (creando) {
        const r = await api.usuariosAdmin.crear(d);
        await informar({
          mensaje: 'El usuario se creó correctamente. Su contraseña es:',
          destacado: r.clave,
          nota: `Pasásela a ${r.usuario.username}: al entrar se le va a pedir que la cambie.`,
        });
        alTerminar(`Se creó el usuario ${r.usuario.username} (contraseña ${r.clave}).`);
      } else {
        await api.usuariosAdmin.actualizar(usuario!.id, d);
        await informar({ mensaje: 'El usuario se actualizó correctamente' });
        alTerminar(`Se actualizó el usuario ${usuario!.username}.`);
      }
    } catch (e) {
      await informarError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!cambio || soloLectura || await confirmar('¿Desea cancelar la edición?', 'no')) alTerminar(null);
  }

  async function blanquear() {
    if (!(await confirmar(
      `¿Quiere blanquear la contraseña de ${usuario!.username}?`, 'no',
      `Queda la contraseña por defecto (${cat.clave_por_defecto}) y al entrar se le va a pedir que la cambie.`,
    ))) return;
    setOcupado(true);
    try {
      const r = await api.usuariosAdmin.blanquear(usuario!.id);
      await informar({
        titulo: 'Contraseña blanqueada',
        mensaje: `La contraseña de ${r.username} ahora es:`,
        destacado: r.clave,
        nota: 'Pasásela al usuario: al entrar se le va a pedir que la cambie.',
      });
      alTerminar(`Se blanqueó la contraseña de ${r.username}: ahora es ${r.clave}.`);
    } catch (e) {
      await informarError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar() {
    if (!(await confirmar('¿Quiere eliminar el usuario?', 'no'))) return;
    setOcupado(true);
    try {
      const r = await api.usuariosAdmin.eliminar(usuario!.id);
      await informar({ mensaje: 'El usuario se eliminó correctamente' });
      alTerminar(`Se eliminó el usuario ${r.username}.`);
    } catch (e) {
      await informarError(e);
    } finally {
      setOcupado(false);
    }
  }

  const deshabilitado = soloLectura || ocupado;
  const esYo = usuario?.id === yo;

  useEscape(() => void cancelar(), ed.dialogoAbierto);

  return (
    <div
      className="dialogo-fondo" role="presentation"
    >
      <form
        className="dialogo panel usuario-editor" role="dialog" aria-modal="true" aria-labelledby="ue-titulo"
        onSubmit={(e) => { e.preventDefault(); void aceptar(); }}
      >
        <header><h2 id="ue-titulo">{titulo}</h2></header>
        <div className="dialogo-cuerpo">
          <div className="usuario-datos">
            <label htmlFor="ue-username">Usuario *</label>
            <input
              id="ue-username" ref={primero} maxLength={15} spellCheck={false} autoComplete="off"
              value={d.username} disabled={!creando || deshabilitado}
              onChange={(e) => cambiar('username', e.target.value)}
            />
            <label htmlFor="ue-nombre">Nombre/Apellido *</label>
            <input
              id="ue-nombre" maxLength={50} value={d.nombre_apellido} disabled={deshabilitado}
              onChange={(e) => cambiar('nombre_apellido', e.target.value)}
            />
            <label htmlFor="ue-dni">DNI</label>
            <input
              id="ue-dni" maxLength={10} value={d.dni} disabled={deshabilitado} inputMode="numeric"
              onChange={(e) => cambiar('dni', e.target.value)}
            />
            <label htmlFor="ue-nivel">Nivel</label>
            <select id="ue-nivel" value={d.nivel} disabled={deshabilitado} onChange={(e) => cambiar('nivel', Number(e.target.value))}>
              {cat.niveles.map((n) => <option key={n} value={n}>{NIVELES[n] ?? n}</option>)}
            </select>
            <span />
            <label className="tilde">
              <input
                type="checkbox" checked={d.habilitado} disabled={deshabilitado || esYo}
                onChange={(e) => cambiar('habilitado', e.target.checked)}
              />
              Habilitado
              {esYo && <small className="tenue"> (no puede deshabilitarse a sí mismo)</small>}
            </label>
          </div>

          <h3 className="separador chico">Secciones</h3>
          <ul className="usuario-secciones">
            {cat.secciones.map((s) => {
              const tiene = d.secciones.includes(s.id);
              return (
                <li key={s.id} className={tiene ? 'tiene' : ''}>
                  <label>
                    <input type="checkbox" checked={tiene} disabled={deshabilitado} onChange={() => alternarSeccion(s.id)} />
                    <span>{s.nombre ?? s.id} <small className="tenue">{s.codigo}</small></span>
                  </label>
                  <label className="por-defecto" title="Sección por defecto">
                    <input
                      type="radio" name="ue-default" checked={d.seccion_default === s.id} disabled={deshabilitado || !tiene}
                      onChange={() => cambiar('seccion_default', s.id)}
                    />
                    <small>por defecto</small>
                  </label>
                </li>
              );
            })}
          </ul>
          {!creando && !soloLectura && (
            <p className="chico tenue" style={{ margin: 0 }}>
              Quitarle una sección le quita también los permisos que tenía en ella.
            </p>
          )}
          <h3 className="separador chico">Permisos</h3>
          <ul className="usuario-permisos">
            {cat.permisos.map((p) => (
              <li key={p.id}>
                <label title={p.nombre}>
                  <input type="checkbox" checked={d.permisos.includes(p.id)} disabled={deshabilitado} onChange={() => alternarPermiso(p.id)} />
                  <span title={p.descripcion ?? undefined}>{p.descripcion || p.nombre}</span>
                </label>
              </li>
            ))}
          </ul>

        </div>
        <footer className="acciones usuario-acciones">
          {!creando && !soloLectura && (
            <span className="izquierda">
              <button type="button" disabled={ocupado} onClick={() => void blanquear()}>Blanquear contraseña</button>
              {!esYo && <button type="button" className="peligro" disabled={ocupado} onClick={() => void eliminar()}>Eliminar</button>}
            </span>
          )}
          <button type="submit" className="primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Aceptar'}</button>
          <button type="button" disabled={ocupado} onClick={() => void cancelar()}>Cancelar</button>
        </footer>
      </form>
    </div>
  );
}
