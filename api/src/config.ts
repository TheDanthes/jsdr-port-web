import { randomBytes } from 'node:crypto';

/**
 * Secreto para firmar los tokens de sesión.
 *
 * Si no viene por entorno se genera uno al azar en cada arranque: es seguro,
 * pero invalida las sesiones abiertas cada vez que el contenedor se reinicia.
 * Para que las sesiones sobrevivan, definir JSDR_SECRETO_SESION.
 */
function secretoSesion(): string {
  const dado = process.env.JSDR_SECRETO_SESION;
  if (dado && dado.length >= 16) return dado;
  if (dado) {
    console.warn('[config] JSDR_SECRETO_SESION es muy corto (<16); se ignora.');
  }
  console.warn(
    '[config] Sin JSDR_SECRETO_SESION: se genera uno al azar. ' +
      'Las sesiones se cierran cuando se reinicia el servicio.',
  );
  return randomBytes(32).toString('hex');
}

export const config = {
  puerto: Number(process.env.API_PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://jsdr:jsdr_dev@127.0.0.1:55432/jsdr_copia',
  // Paginado del sistema original: Constants.FIND_NOTICIAS_LIMIT / FIND_CABLES_LIMIT
  limitePagina: 30,
  limitePalabras: 100,

  secretoSesion: secretoSesion(),
  /** Duración del token de sesión. Una jornada de redacción entra holgada. */
  horasSesion: Number(process.env.JSDR_HORAS_SESION ?? 12),

  /**
   * Carpeta del build de la web. Si existe, la API la sirve en el mismo
   * puerto; si no, arranca sólo como API — que es el modo de desarrollo,
   * donde Vite sirve el front en su propio puerto.
   */
  rutaWeb: process.env.JSDR_RUTA_WEB ?? '../web/dist',

  /** Orígenes permitidos por CORS en desarrollo (Vite). */
  origenesDev: ['http://localhost:5173', 'http://127.0.0.1:5173'],
} as const;
