import type { FastifyInstance } from 'fastify';
import { autenticar, cargarSesion } from '../datos/sesion.js';
import { emitirToken, tokenDeCabecera, verificarToken } from '../sesion/token.js';

interface CuerpoLogin {
  username?: string;
  password?: string;
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
    const { token, vence } = emitirToken(usuario.username);
    const sesion = await cargarSesion(usuario.username);
    req.log.info({ username: usuario.username }, 'login');

    return { token, vence, ...sesion };
  });

  /** Estado de la sesión actual. La web la llama al abrir, para no pedir login de nuevo. */
  app.get('/sesion', async (req, rep) => {
    const carga = verificarToken(tokenDeCabecera(req.headers.authorization));
    if (!carga) return rep.code(401).send({ error: 'sesión inválida o vencida' });

    const sesion = await cargarSesion(carga.u);
    if (!sesion) return rep.code(401).send({ error: 'el usuario ya no está habilitado' });

    return { vence: new Date(carga.exp * 1000).toISOString(), ...sesion };
  });
}
