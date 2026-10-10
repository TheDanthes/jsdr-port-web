import type { FastifyInstance } from 'fastify';
import { consultar } from '../db.js';
import { enSesion } from '../datos/conectados.js';
import { vivas } from '../datos/aperturas.js';

/** Los mensajes del Swing (mensajes_error.properties). */
export const MENSAJES_MONITOR = {
  sinPermiso: 'No tiene permiso para monitorear usuarios',
};

interface NoticiaAbierta {
  id: number;
  numero: number;
  guia: string | null;
  titulo: string | null;
  titular: string | null;
  seccion_codigo: string | null;
  confidencial: boolean;
  redactor: string | null;
}

/** Lo que el monitor muestra de una noticia abierta (de una confidencial ajena, casi nada). */
type Abierta =
  | Omit<NoticiaAbierta, 'redactor'>
  | { numero: number; confidencial: true };

/**
 * Administración → Monitor de Usuarios (MonitorUsuariosJPanel). Exige
 * MONITOREAR_USUARIOS, como MotorReglas.puedeMonitorearUsuarios.
 *
 * Además de lo que mostraba el Swing (usuario e IP, en verde o en rojo), dice
 * desde cuándo está cada uno, cuándo dio la última señal y qué noticia tiene
 * abierta en el editor. Una noticia confidencial no se identifica: en la web
 * la ve sólo su redactor, y el monitor no es la excepción.
 */
export async function rutasMonitor(app: FastifyInstance) {
  /** La web lo llama una vez por minuto: la guardia ya anotó la actividad. */
  app.post('/sesion/latido', async (_req, rep) => rep.code(204).send());

  app.get('/monitor/usuarios', async (req, rep) => {
    if (!req.sesion.permisos.some((p) => p.nombre === 'MONITOREAR_USUARIOS')) {
      return rep.code(403).send({ error: MENSAJES_MONITOR.sinPermiso });
    }

    const sesiones = enSesion();
    const abiertas = vivas();
    const usernames = [...new Set([...sesiones.map((s) => s.username), ...abiertas.map((a) => a.usuario)])];

    const [nombres, noticias] = await Promise.all([
      usernames.length
        ? consultar<{ username: string; nombre_apellido: string | null; nivel: number | null }>(
          `SELECT DISTINCT ON (username) username, nombre_apellido, nivel
             FROM usuarios WHERE username = ANY($1) ORDER BY username, id`, [usernames])
        : [],
      abiertas.length
        ? consultar<NoticiaAbierta>(
          `SELECT n.id, v.numero, v.redactor, COALESCE(n.guia, t.guia) AS guia, v.titulo,
                  left(COALESCE(t.titular, v.titular), 300) AS titular,
                  s.codigo AS seccion_codigo,
                  -- Marcada en el editor y todavía sin guardar también cuenta.
                  (COALESCE(v.confidencial, false) OR COALESCE(t.confidencial, false)) AS confidencial
             FROM noticias n
             JOIN versiones v ON v.id_noticia = n.id AND v.numero = n.numero_version_activa
             LEFT JOIN secciones s ON s.id = v.id_seccion
             LEFT JOIN versiones_tmp t ON t.id_noticia = n.id AND t.numero = v.numero
            WHERE n.id = ANY($1)`, [abiertas.map((a) => a.id)])
        : [],
    ]);

    const nombre = new Map(nombres.map((u) => [u.username, u]));
    const datos = new Map(noticias.map((n) => [n.id, n]));

    // Cada noticia abierta va en la sesión viva más reciente de su redactor.
    // (El registro de aperturas es por usuario, no por pestaña: con dos
    // sesiones abiertas no se sabe en cuál está, y casi nunca pasa.)
    const filas = sesiones.map((s) => ({
      ...s,
      nombre_apellido: nombre.get(s.username)?.nombre_apellido ?? null,
      nivel: nombre.get(s.username)?.nivel ?? null,
      noticias: [] as Abierta[],
    }));
    for (const a of abiertas) {
      const n = datos.get(a.id);
      if (!n) continue;
      const fila = filas
        .filter((f) => f.username === a.usuario && f.vivo)
        .sort((x, y) => y.ultima.localeCompare(x.ultima))[0];
      if (!fila) continue;
      const { redactor, ...resto } = n;
      fila.noticias.push(n.confidencial && redactor !== req.sesion.usuario.username
        ? { numero: a.numero, confidencial: true }
        : { ...resto, numero: a.numero });
    }

    return { usuarios: filas, ahora: new Date().toISOString() };
  });
}
