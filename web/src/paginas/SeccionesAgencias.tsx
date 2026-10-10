import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import type { AgenciaAdmin, SeccionAdmin } from '../api/tipos';
import { useEditor } from '../editor/EditorContexto';
import { useSesion } from '../sesion';
import { AvisoError, Cargando } from '../componentes/piezas';
import { useEscape } from '../componentes/useEscape';

/**
 * Administración → Secciones y → Agencias. Port de AdministradorSeccionesJPanel
 * y AdministradorAgenciasJPanel con sus editores: la misma lista, los mismos
 * campos y las mismas confirmaciones y mensajes.
 */
type Que = 'secciones' | 'agencias';

const TEXTOS = {
  secciones: {
    titulo: 'Administración de Secciones', nav: 'Secciones', una: 'la sección',
    agregar: '¿Quiere agregar la sección?', actualizar: '¿Quiere actualizar la sección?',
    cancelarCrear: '¿Desea cancelar la creación de la sección?', cancelarAct: '¿Desea cancelar la actualización de la sección?',
    creada: 'La sección se creó correctamente', actualizada: 'La sección se actualizó correctamente',
    eliminar: '¿Quiere eliminar la sección?', eliminada: 'La sección se eliminó correctamente',
  },
  agencias: {
    titulo: 'Administrador de Agencias', nav: 'Agencias', una: 'la agencia',
    agregar: '¿Quiere agregar la agencia?', actualizar: '¿Quiere actualizar la agencia?',
    cancelarCrear: '¿Desea cancelar la creación de la agencia?', cancelarAct: '¿Desea cancelar la actualización de la agencia?',
    creada: 'La agencia se creó correctamente', actualizada: 'La agencia se actualizó correctamente',
    eliminar: '¿Quiere eliminar la agencia?', eliminada: 'La agencia se eliminó correctamente',
  },
} as const;

type Fila = SeccionAdmin | AgenciaAdmin;
const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const Secciones = () => <Abm que="secciones" />;
export const Agencias = () => <Abm que="agencias" />;

function Abm({ que }: { que: Que }) {
  const t = TEXTOS[que];
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editando, setEditando] = useState<Fila | 'nueva' | null>(null);
  const [recargar, setRecargar] = useState(0);
  const edicion = useSesion().sesion?.edicion === true;

  useEffect(() => {
    let vivo = true;
    (que === 'secciones' ? api.admin.secciones() : api.admin.agencias())
      .then((f) => { if (vivo) { setFilas(f); setError(null); } })
      .catch((e) => { if (vivo) setError(mensajeDe(e)); });
    return () => { vivo = false; };
  }, [que, recargar]);

  const abrir = (f: Fila | 'nueva') => { setAviso(null); setEditando(f); };

  return (
    <div className="panel abm">
      <header>
        <h2>
          <Link to="/administracion" className="tenue" style={{ fontWeight: 400 }}>Administración</Link>
          {' › '}{t.nav}
        </h2>
        {edicion && <button type="button" className="primario" onClick={() => abrir('nueva')}>Agregar</button>}
      </header>
      {error && <AvisoError>{error}</AvisoError>}
      {aviso && <div className="aviso info" role="status">{aviso}</div>}

      <h3 className="separador">{t.nav}{filas && <span className="tenue"> ({filas.length})</span>}</h3>
      {!filas && !error && <Cargando que={`Cargando ${que}`} />}
      {filas && (
        <div className="tabla-marco">
          <table className="lista abm-tabla">
            <thead>
              {que === 'secciones' ? (
                <tr><th>Nombre</th><th>Código</th><th className="num">Usuarios</th><th className="num">Versiones de noticias</th></tr>
              ) : (
                <tr><th>Nombre</th><th>Código</th><th className="num">Vida útil</th><th>Habilitada</th><th className="num">Cables</th></tr>
              )}
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.id} tabIndex={0}
                  className={`clicable${'habilitada' in f && f.habilitada === false ? ' deshabilitado' : ''}`}
                  onClick={() => abrir(f)} onKeyDown={(e) => { if (e.key === 'Enter') abrir(f); }}
                >
                  <td><b>{f.nombre}</b></td>
                  <td><code>{f.codigo}</code></td>
                  {'usuarios' in f ? (
                    <>
                      <td className="num">{f.usuarios.toLocaleString('es-AR')}</td>
                      <td className="num">{f.versiones.toLocaleString('es-AR')}</td>
                    </>
                  ) : (
                    <>
                      <td className="num">{f.dias_vida_util ?? '—'} días</td>
                      <td>{f.habilitada === false ? 'No' : 'Sí'}</td>
                      <td className="num">{f.cables.toLocaleString('es-AR')}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="chico tenue abm-pie">
        Elegí {que === 'secciones' ? 'una sección' : 'una agencia'} para editarla o eliminarla.{' '}
        {que === 'secciones'
          ? 'Una sección con noticias o usuarios no se puede eliminar. El código (2 letras) es el que usa la fotocomposición: una sección nueva va a la carpeta de InDesign por defecto hasta que se la agregue al composer.'
          : 'Una agencia con cables no se puede eliminar: se deshabilita. El código (1 carácter) distingue mayúsculas: es el que traen los cables.'}
      </p>

      {editando && (
        <Editor
          que={que} fila={editando === 'nueva' ? null : editando} soloLectura={!edicion}
          alTerminar={(m) => { setEditando(null); if (m) { setAviso(m); setRecargar((n) => n + 1); } }}
        />
      )}
    </div>
  );
}

interface Datos { nombre: string; codigo: string; dias_vida_util: string; habilitada: boolean }

function Editor({ que, fila, soloLectura, alTerminar }: {
  que: Que; fila: Fila | null; soloLectura: boolean; alTerminar: (mensaje: string | null) => void;
}) {
  const t = TEXTOS[que];
  const creando = fila === null;
  const titulo = `${t.titulo} - ${creando ? 'Creación' : 'Edición'}`;
  const inicial: Datos = {
    nombre: fila?.nombre ?? '', codigo: fila?.codigo ?? '',
    dias_vida_util: fila && 'dias_vida_util' in fila ? String(fila.dias_vida_util ?? '') : '3',
    habilitada: fila && 'habilitada' in fila ? fila.habilitada !== false : true,
  };
  const [d, setD] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const ed = useEditor();
  const primero = useRef<HTMLInputElement>(null);
  const cambio = JSON.stringify(d) !== JSON.stringify(inicial);
  useEffect(() => { primero.current?.focus(); }, []);

  const confirmar = async (mensaje: string, porDefecto: 'si' | 'no') =>
    (await ed.preguntar({
      titulo, mensaje,
      botones: [{ etiqueta: 'Si', valor: 'si', principal: porDefecto === 'si' }, { etiqueta: 'No', valor: 'no', principal: porDefecto === 'no' }],
      cancelar: 'no',
    })).boton === 'si';
  const informar = (mensaje: string, detalles?: string[]) =>
    ed.preguntar({ titulo, mensaje, detalles, botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }], cancelar: 'ok' });
  const informarError = (e: unknown) =>
    e instanceof ErrorApi && e.errores.length > 1 ? informar('Revise los datos:', e.errores) : informar(mensajeDe(e));

  async function aceptar() {
    if (soloLectura || (!creando && !cambio)) { alTerminar(null); return; }
    if (!(await confirmar(creando ? t.agregar : t.actualizar, 'si'))) return;
    setOcupado(true);
    try {
      const datos = que === 'secciones'
        ? { nombre: d.nombre, codigo: d.codigo }
        : { nombre: d.nombre, codigo: d.codigo, dias_vida_util: Number(d.dias_vida_util), habilitada: d.habilitada };
      if (creando) await api.admin.crear(que, datos); else await api.admin.actualizar(que, fila.id, datos);
      await informar(creando ? t.creada : t.actualizada);
      alTerminar(`${creando ? t.creada : t.actualizada}: ${d.nombre.trim()}.`);
    } catch (e) {
      await informarError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function cancelar() {
    if (!cambio || soloLectura || await confirmar(creando ? t.cancelarCrear : t.cancelarAct, 'no')) alTerminar(null);
  }

  async function eliminar() {
    if (!(await confirmar(t.eliminar, 'no'))) return;
    setOcupado(true);
    try {
      await api.admin.eliminar(que, fila!.id);
      await informar(t.eliminada);
      alTerminar(`${t.eliminada}: ${fila!.nombre}.`);
    } catch (e) {
      await informarError(e);
    } finally {
      setOcupado(false);
    }
  }

  const des = soloLectura || ocupado;
  useEscape(() => void cancelar(), ed.dialogoAbierto);

  return (
    <div
      className="dialogo-fondo" role="presentation"
    >
      <form
        className="dialogo panel abm-editor" noValidate role="dialog" aria-modal="true" aria-labelledby="abm-titulo"
        onSubmit={(e) => { e.preventDefault(); void aceptar(); }}
      >
        <header><h2 id="abm-titulo">{titulo}</h2></header>
        <div className="dialogo-cuerpo usuario-datos">
          <label htmlFor="abm-nombre">Nombre</label>
          <input id="abm-nombre" ref={primero} maxLength={que === 'secciones' ? 30 : 50} value={d.nombre} disabled={des}
            onChange={(e) => setD({ ...d, nombre: e.target.value })} />
          <label htmlFor="abm-codigo">Código</label>
          <input id="abm-codigo" className="abm-codigo" maxLength={que === 'secciones' ? 2 : 1} value={d.codigo} disabled={des} spellCheck={false}
            onChange={(e) => setD({ ...d, codigo: que === 'secciones' ? e.target.value.toUpperCase() : e.target.value })} />
          {que === 'agencias' && (
            <>
              <label htmlFor="abm-dias">Vida útil (días)</label>
              <input id="abm-dias" className="abm-codigo" type="number" min={1} value={d.dias_vida_util} disabled={des}
                onChange={(e) => setD({ ...d, dias_vida_util: e.target.value })} />
              <span />
              <label className="tilde">
                <input type="checkbox" checked={d.habilitada} disabled={des} onChange={(e) => setD({ ...d, habilitada: e.target.checked })} />
                Habilitada
              </label>
            </>
          )}
        </div>
        <footer className="acciones usuario-acciones">
          {!creando && !soloLectura && (
            <span className="izquierda">
              <button type="button" className="peligro" disabled={ocupado} onClick={() => void eliminar()}>Eliminar</button>
            </span>
          )}
          <button type="submit" className="primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Aceptar'}</button>
          <button type="button" disabled={ocupado} onClick={() => void cancelar()}>Cancelar</button>
        </footer>
      </form>
    </div>
  );
}
