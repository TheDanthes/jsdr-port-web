import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './sesion';
import { Login } from './paginas/Login';
import { BuscadorNoticias } from './paginas/BuscadorNoticias';
import { DetalleNoticia } from './paginas/DetalleNoticia';
import { BuscadorCables } from './paginas/BuscadorCables';
import { Eliminadas } from './paginas/Eliminadas';
import { NIVELES } from './api/tipos';

export function App() {
  const { sesion, cargando, salir } = useSesion();

  if (cargando) return <div className="cargando">Abriendo sesión…</div>;
  if (!sesion) return <Login />;

  const u = sesion.usuario;

  return (
    <div className="app">
      <a className="saltar-al-contenido" href="#contenido">Saltar al contenido</a>

      <header className="barra">
        <div className="marca">jSDR <span>sólo lectura</span></div>

        <nav className="nav">
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
          <button className="plano" onClick={salir}>Salir</button>
        </div>
      </header>

      <main className="contenido" id="contenido">
        <Routes>
          <Route path="/noticias" element={<BuscadorNoticias />} />
          <Route path="/noticias/:id" element={<DetalleNoticia />} />
          <Route path="/cables" element={<BuscadorCables />} />
          <Route path="/eliminadas" element={<Eliminadas />} />
          <Route path="*" element={<Navigate to="/noticias" replace />} />
        </Routes>
      </main>
    </div>
  );
}
