export const config = {
  puerto: Number(process.env.API_PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://jsdr:jsdr_dev@127.0.0.1:55432/jsdr_copia',
  // Paginado del sistema original: Constants.FIND_NOTICIAS_LIMIT / FIND_CABLES_LIMIT
  limitePagina: 30,
  limitePalabras: 100,
} as const;
