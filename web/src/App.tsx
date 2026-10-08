import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './sesion';
import { Login } from './paginas/Login';
import { BuscadorNoticias } from './paginas/BuscadorNoticias';
import { DetalleNoticia } from './paginas/DetalleNoticia';
import { BuscadorCables } from './paginas/BuscadorCables';
import { Eliminadas } from './paginas/Eliminadas';
import { Editor } from './paginas/Editor';
import { ProveedorEditor, useEditor } from './editor/EditorContexto';
import { NIVELES } from './api/tipos';

export function App() {
  const { sesion, cargando } = useSesion();

  if (cargando) return <div className="cargando">Abriendo sesión…</div>;
  if (!sesion) return <Login />;

  // El editor vive por encima de las rutas: las noticias abiertas siguen
  // abiertas mientras se usa el buscador.
  return (
    <ProveedorEditor>
      <Marco />
    </ProveedorEditor>
  );
}

function Marco() {
  const { sesion, salir } = useSesion();
  const ed = useEditor();
  const u = sesion!.usuario;
  const edicion = sesion!.edicion === true;
  const abiertas = ed.pestanas.length;

  async function salirConCuidado() {
    if (abiertas > 0) {
      // Una noticia abierta queda EN_EDICION (bloqueada) hasta que se cierra.
      await ed.preguntar({
        titulo: 'Hay noticias abiertas',
        mensaje:
          `Tenés ${abiertas === 1 ? 'una noticia abierta' : `${abiertas} noticias abiertas`} en el editor. ` +
          'Cerralas con F2 antes de salir: si no, quedan bloqueadas (EN_EDICION).',
        botones: [{ etiqueta: 'Aceptar', valor: 'ok', principal: true }],
      });
      return;
    }
    salir();
  }

  return (
    <div className="app">
      <a className="saltar-al-contenido" href="#contenido">Saltar al contenido</a>

      <header className="barra">
        <div className="marca">jSDR <span>{edicion ? 'redacción' : 'sólo lectura'}</span></div>

        <nav className="nav">
          {edicion && (
            <NavLink to="/editor" className={({ isActive }) => (isActive ? 'activo' : '')}>
              Editor{abiertas > 0 && <span className="contador">{abiertas}</span>}
            </NavLink>
          )}
          <NavLink to="/noticias" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Noticias
          </NavLink>
          <NavLink to="/cables" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Cables
          </NavLink>
          <NavLink to="/eliminadas" className={({ isActive }) => (isActive ? 'activo' : '')}>
            Eliminadas
          </NavLink>
        </nav>

        <div className="sesion">
          <div className="quien">
            <b>{u.nombre_apellido || u.username}</b>
            <small>
              {u.username}
              {u.nivel !== null && ` · ${NIVELES[u.nivel] ?? `nivel ${u.nivel}`}`}
            </small>
          </div>
          <button className="plano" onClick={() => void salirConCuidado()}>Salir</button>
        </div>
      </header>

      <main className="contenido" id="contenido">
        <Routes>
          <Route path="/noticias" element={<BuscadorNoticias />} />
          <Route path="/noticias/:id" element={<DetalleNoticia />} />
          <Route path="/cables" element={<BuscadorCables />} />
          <Route path="/eliminadas" element={<Eliminadas />} />
          {edicion && <Route path="/editor" element={<Editor />} />}
          <Route path="*" element={<Navigate to="/noticias" replace />} />
        </Routes>
      </main>
    </div>
  );
}
