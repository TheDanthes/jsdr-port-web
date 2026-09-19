# jSDR Port Web — imagen única: API + web
#
# El contexto de build es la raíz del repo, porque la imagen necesita las dos
# carpetas. La web se compila a estáticos y la API los sirve en su mismo
# puerto: un solo contenedor, un solo puerto, nada de CORS ni proxy delante.

# --- 1. la web ---------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/tsconfig.json web/vite.config.ts web/index.html ./
COPY web/src ./src
RUN npm run build

# --- 2. la API ---------------------------------------------------------------
FROM node:22-alpine AS api
WORKDIR /api
COPY api/package*.json ./
RUN npm ci
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npx tsc

# --- 3. lo que se publica ----------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3099
# dist/index.js resuelve la ruta de la web relativa a sí mismo.
ENV JSDR_RUTA_WEB=../web

COPY api/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=api /api/dist ./dist
COPY --from=web /web/dist ./web

# No corre como root.
USER node
EXPOSE 3099

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3099/salud > /dev/null || exit 1

CMD ["node", "dist/index.js"]
