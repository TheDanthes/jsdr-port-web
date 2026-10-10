import type { FastifyInstance } from 'fastify';
import { autenticar, cargarSesion } from '../datos/sesion.js';
import { emitirToken, tokenDeCabecera, verificarToken } from '../sesion/token.js';
import { config } from '../config.js';
import { transaccion } from '../db.js';
import { entrar, olvidar, sesionViva } from '../datos/conectados.js';
import { soltar } from '../datos/aperturas.js';
import { ipDe, sesionDelPedido } from '../sesion/guardia.js';

interface CuerpoLogin {
  username?: string;
  password?: string;
  /** "Sí, seguir aquí": cerrar la sesión que el usuario tiene abierta en otro equipo. */
  forzar?: unknown;
}

/**
 * Freno simple contra fuerza bruta, en memoria y por username.
 *
 * Las contraseñas de esta base son de hasta 10 caracteres en texto plano, así
 * que conviene que probarlas a mano cueste. No pretende ser una defensa seria
 * —para eso está que el servicio viva sólo en la LAN— pero corta el goteo.
 */
const intentos = new Map<string, { fallos: number; hasta: number }>();
const MAX_FALLOS = 8;
const ESPERA_MS = 60_000;

function bloqueado(username: string): number {
  const e = intentos.get(username);
  if (!e || e.hasta < Date.now()) return 0;
  return e.fallos >= MAX_FALLOS ? Math.ceil((e.hasta - Date.now()) / 1000) : 0;
}

function anotarFallo(username: string) {
  const e = intentos.get(username);
  const vigente = e && e.hasta > Date.now() ? e : { fallos: 0, hasta: 0 };
  intentos.set(username, { fallos: vigente.fallos + 1, hasta: Date.now() + ESPERA_MS });
}

/** Los mensajes del Swing (servicioseguridad.cambiopassword.*), sin sus erratas. */
export const MENSAJES_CLAVE = {
  actualIncorrecta: 'La contraseña actual es incorrecta',
  noCoinciden: 'La contraseña nueva y su repetición no coinciden',
  longitud: 'La longitud de la contraseña es incorrecta: tiene que tener entre 6 y 10 caracteres',
  igualDefecto: 'La contraseña nueva no puede ser igual a la contraseña por defecto',
} as const;

export async function rutasSesion(app: FastifyInstance) {
  /** Login. Devuelve el token y todo lo que la web necesita para arrancar. */
  app.post<{ Body: CuerpoLogin }>('/sesion', async (req, rep) => {
    const username = req.body?.username?.trim();
    const password = req.body?.password ?? '';

    if (!username) {
      return rep.code(400).send({ error: 'falta el usuario' });
    }

    const espera = bloqueado(username);
    if (espera) {
      return rep
        .code(429)
        .send({ error: `demasiados intentos fallidos, probá en ${espera} segundos` });
    }

    const usuario = await autenticar(username, password);
    if (!usuario) {
      anotarFallo(username);
      req.log.warn({ username }, 'login fallido');
      // Mismo mensaje exista o no el usuario, y esté o no habilitado.
      return rep.code(401).send({ error: 'usuario o contraseña incorrectos' });
    }

    intentos.delete(username);

    // Una sola sesión por usuario (ServicioSeguridadBean.login): si ya tiene
    // una viva en otro equipo, se pregunta antes de cerrarla. Recién se dice
    // después de validar la contraseña: el que no la sabe no se entera de
    // quién está conectado.
    const otra = sesionViva(usuario.username);
    if (otra && req.body?.forzar !== true) {
      return rep.code(409).send({
        error: 'Ya te encontrás logueado. ¿Deseás seguir aquí?',
        motivo: 'ya_logueado', ip: otra.ip, desde: otra.inicio,
      });
    }

    const { token, vence } = emitirToken(usuario.username);
    const sesion = await cargarSesion(usuario.username);
    const reemplazo = entrar(token, usuario.username, ipDe(req), Math.floor(Date.parse(vence) / 1000));
    // Las ventanas del editor de la sesión anterior ya no valen: sus noticias
    // quedan para recuperar desde el último autoguardado.
    if (reemplazo) soltar(usuario.username);
    req.log.info({ username: usuario.username, ip: ipDe(req), reemplazo, anterior: otra?.ip }, 'login');

    // `edicion`: si esta instalación permite editar (JSDR_EDICION). La web
    // muestra u oculta el editor según esto.
    return { token, vence, ...sesion, edicion: config.edicion };
  });

  /** Estado de la sesión actual. La web la llama al abrir, para no pedir login de nuevo. */
  app.get('/sesion', async (req, rep) => {
    const r = await sesionDelPedido(req);
    if (!r.ok) return rep.code(401).send(r.cuerpo);
    return { vence: new Date(r.carga.exp * 1000).toISOString(), ...r.sesion, edicion: config.edicion };
  });

  /**
   * Cambio de contraseña (ServicioSeguridadBean.cambiarPassword), con las
   * reglas y los mensajes del Swing, en el mismo orden. Va fuera de la
   * guardia porque es lo único que puede hacer quien entró con la contraseña
   * por defecto; en ese caso no se pide la actual: es la por defecto, y quizás
   * se la blanquearon mientras estaba conectado y no la sabe.
   */
  app.put<{ Body: { actual?: unknown; nueva?: unknown; repeticion?: unknown } | null }>('/sesion/clave', async (req, rep) => {
    const r = await sesionDelPedido(req);
    if (!r.ok) return rep.code(401).send(r.cuerpo);
    if (!config.edicion) {
      return rep.code(403).send({ error: 'La edición está deshabilitada en esta instalación (sólo lectura).' });
    }
    const u = r.sesion.usuario;
    const texto = (v: unknown) => (typeof v === 'string' ? v : '');
    const actual = texto(req.body?.actual), nueva = texto(req.body?.nueva), repeticion = texto(req.body?.repeticion);

    if (!u.debe_cambiar_password) {
      const espera = bloqueado(u.username);
      if (espera) return rep.code(429).send({ error: `demasiados intentos fallidos, probá en ${espera} segundos` });
      if (!(await autenticar(u.username, actual))) {
        anotarFallo(u.username);
        return rep.code(400).send({ error: MENSAJES_CLAVE.actualIncorrecta });
      }
    }
    if (nueva !== repeticion) return rep.code(400).send({ error: MENSAJES_CLAVE.noCoinciden });
    if (nueva.length < 6 || nueva.length > 10) return rep.code(400).send({ error: MENSAJES_CLAVE.longitud });
    if (nueva.trim() === config.claveDefecto) return rep.code(400).send({ error: MENSAJES_CLAVE.igualDefecto });

    await transaccion((c) => c.query(`UPDATE usuarios SET password = $1 WHERE id = $2`, [nueva, u.id]));
    req.log.info({ username: u.username, obligatorio: u.debe_cambiar_password }, 'cambio de contraseña');
    return { ok: true, mensaje: 'Se cambió la contraseña exitosamente' };
  });

  /**
   * Salir (logout del Swing): la sesión deja de figurar en el monitor y el
   * token deja de valer en el servidor. La web además se olvida del token.
   */
  app.delete('/sesion', async (req, rep) => {
    const token = tokenDeCabecera(req.headers.authorization);
    if (token && verificarToken(token)) olvidar(token);
    return rep.code(204).send();
  });
}
