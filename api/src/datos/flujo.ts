/**
 * El flujo de la redacción desde el buscador (Fase 4): pasar de nivel y
 * autorizar, eliminar, restaurar una versión eliminada y cambiar la
 * confidencialidad.
 *
 * Port de AdministradorNoticiasBean (pasarNoticiaDeNivel, autorizarNoticia,
 * eliminarNoticia, restaurarVersionEliminada, cambiarConfidencialidadNoticia)
 * con el SQL de PostgresqlNoticiaDAO y las reglas de MotorReglas. Mismos
 * mensajes. Cada operación es una transacción: en el EJB también lo era (el
 * contenedor deshacía todo si algo fallaba), así que una noticia nunca queda
 * autorizada a medias por un pase de nivel que no se pudo hacer.
 */
import { transaccion } from '../db.js';
import type { SesionUsuario } from './sesion.js';
import { aReglas, cargar, ErrorEditor, usuarioReglas } from './edicion.js';
import {
  MENSAJES, hoy, puedeAutorizarNoticia, puedeCambiarConfidencialidadNoticia, puedeEliminarNoticia,
  puedePasarDeNivelNoticia, puedeRestaurarVersion,
} from '../dominio/reglas.js';
import type { NoticiaCargada } from './edicion.js';

/**
 * Si quien hizo el cambio la sigue viendo en la web. Es la regla de lectura de
 * la web (noticias.ts), no MotorReglas.puedeVerNoticia: el Swing dejaba ver una
 * confidencial también a los de nivel superior a quien la marcó, y la
 * redacción decidió (2026-10-10) que en la web la vea sólo su redactor.
 */
const laSigueViendo = (n: NoticiaCargada, username: string) =>
  n.activa.confidencial !== true || n.activa.redactor === username;

export const NIVELES: Record<number, string> = { 10: 'Redactor', 20: 'Jefe', 30: 'Secretario' };

/**
 * AdministradorNoticias.pasarNoticiaDeNivel. Autorizar no es una operación
 * aparte: si la noticia está EN_EJECUCION, pasarla de nivel primero la
 * autoriza (su redactor, en su nivel) y después cambia el nivel. Pasarla al
 * mismo nivel en que está sólo la autoriza.
 */
export async function pasarDeNivel(id: number, nivel: number, s: SesionUsuario) {
  if (!(nivel in NIVELES)) throw new ErrorEditor(400, 'Nivel inválido.');
  const u = usuarioReglas(s);
  return transaccion(async (c) => {
    const n = await cargar(c, id);
    if (!n) throw new ErrorEditor(404, MENSAJES.pasarNivelEliminada);
    const numero = n.numero_version_activa;

    let autorizada = false;
    if (n.activa.estado === 'EN_EJECUCION') {
      puedeAutorizarNoticia(aReglas(n), u);
      await c.query(
        `UPDATE versiones SET estado = 'AUTORIZADA' WHERE id_noticia = $1 AND numero = $2`, [id, numero]);
      n.activa.estado = 'AUTORIZADA';
      autorizada = true;
    }

    const nivelActual = n.activa.nivel ?? 0;
    if (nivelActual !== nivel) {
      puedePasarDeNivelNoticia(aReglas(n), u, nivel);
      await c.query(`UPDATE versiones SET nivel = $1 WHERE id_noticia = $2 AND numero = $3`, [nivel, id, numero]);
      n.activa.nivel = nivel;
    } else if (!autorizada) {
      throw new ErrorEditor(409, MENSAJES.igualNivel);
    }

    return {
      guia: n.guia, estado: n.activa.estado, nivel, nivel_nombre: NIVELES[nivel], autorizada,
      visible: laSigueViendo(n, u.username),
    };
  });
}

/**
 * AdministradorNoticias.eliminarNoticia: la versión activa queda marcada
 * eliminada (con la fecha de hoy) y pasa a ser activa la más alta que queda.
 * Si no queda ninguna, la noticia se queda sin versión activa (-1).
 */
export async function eliminar(id: number, s: SesionUsuario) {
  const u = usuarioReglas(s);
  return transaccion(async (c) => {
    const n = await cargar(c, id);
    if (!n) throw new ErrorEditor(404, MENSAJES.eliminarEliminada);
    puedeEliminarNoticia(aReglas(n), u);
    const numero = n.numero_version_activa;
    await c.query(
      `UPDATE versiones SET eliminada = true, fecha_eliminacion = $1 WHERE id_noticia = $2 AND numero = $3`,
      [hoy(), id, numero],
    );
    // Noticia.eliminarVersion(): la de número más alto entre las que quedan.
    const quedan = n.versiones.filter((v) => v.numero !== numero).map((v) => v.numero);
    const activa = quedan.length ? Math.max(...quedan) : -1;
    await c.query(`UPDATE noticias SET numero_version_activa = $1 WHERE id = $2`, [activa, id]);
    return { guia: n.guia, version_activa: activa > 0 ? activa : null };
  });
}

/**
 * AdministradorNoticias.restaurarVersionEliminada. Sólo la última versión
 * creada de la noticia (MotorReglas.puedeRestaurarVersion).
 *
 * Dos controles que el Swing no tenía: la versión tiene que ser del usuario
 * (la pantalla sólo le mostraba las suyas, pero el servidor no lo verificaba)
 * y la noticia no puede estar abierta en el editor (restaurar cambiaría la
 * versión activa por debajo de quien la está editando).
 */
export async function restaurar(id: number, numero: number, s: SesionUsuario) {
  return transaccion(async (c) => {
    const cab = await c.query<{ numero_version_activa: number; numero_proxima_version: number | null; guia: string | null }>(
      `SELECT numero_version_activa, numero_proxima_version, guia FROM noticias WHERE id = $1 FOR UPDATE`, [id]);
    const n = cab.rows[0];
    const ver = await c.query<{ redactor: string; eliminada: boolean | null }>(
      `SELECT redactor, eliminada FROM versiones WHERE id_noticia = $1 AND numero = $2`, [id, numero]);
    const v = ver.rows[0];
    if (!n || !v || v.eliminada !== true) throw new ErrorEditor(404, 'La versión no está eliminada.');
    if (v.redactor !== s.usuario.username) throw new ErrorEditor(403, MENSAJES.restaurarPermiso);

    const activa = await c.query<{ estado: string }>(
      `SELECT estado FROM versiones WHERE id_noticia = $1 AND numero = $2`, [id, n.numero_version_activa]);
    if (activa.rows[0]?.estado === 'EN_EDICION') throw new ErrorEditor(409, MENSAJES.enEdicion);

    puedeRestaurarVersion(numero, n.numero_proxima_version ?? n.numero_version_activa + 1);
    await c.query(
      `UPDATE versiones SET eliminada = false, fecha_eliminacion = NULL WHERE id_noticia = $1 AND numero = $2`,
      [id, numero]);
    await c.query(`UPDATE noticias SET numero_version_activa = $1 WHERE id = $2`, [numero, id]);
    return { guia: n.guia, version_activa: numero };
  });
}

/** AdministradorNoticias.cambiarConfidencialidadNoticia. */
export async function cambiarConfidencialidad(id: number, s: SesionUsuario) {
  const u = usuarioReglas(s);
  return transaccion(async (c) => {
    const n = await cargar(c, id);
    if (!n) throw new ErrorEditor(404, MENSAJES.confidencialEliminada);
    puedeCambiarConfidencialidadNoticia(aReglas(n), u);
    const confidencial = n.activa.confidencial !== true;
    await c.query(
      `UPDATE versiones SET confidencial = $1 WHERE id_noticia = $2 AND numero = $3`,
      [confidencial, id, n.numero_version_activa]);
    n.activa.confidencial = confidencial;
    const actual = n.versiones.find((x) => x.numero === n.numero_version_activa);
    if (actual) actual.confidencial = confidencial;
    return { guia: n.guia, confidencial, redactor: n.activa.redactor, visible: laSigueViendo(n, u.username) };
  });
}
