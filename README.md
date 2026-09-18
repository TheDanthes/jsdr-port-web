# JSDR Port Web

Port del **jSDR** — el sistema de redacción del diario *La Capital* (Rosario) — desde el
cliente Java Swing sobre JBoss a un stack web.

El sistema original está **en producción desde 2005** y sigue sacando el diario todos los días.
Este port no lo reemplaza de golpe: convive con él y se corta por fases.

---

## Qué es el sistema original

| | |
|---|---|
| jSDR 1.6.0 (cliente) / v1.7 (servidor, nov-2013) | GITI, para Seller S.A. / diario La Capital |
| Cliente Swing + 14 EJB sobre JBoss 4.0.1 | PostgreSQL 8.0.3, UTF-8 |
| Servidor: Fedora Core 3 (2004), kernel 2.6.9, i686 | 1.093.772 noticias · 1.297.497 versiones (2005-2026) |
| 170 usuarios: 91 redactores, 52 jefes, 27 secretarios | ~37 versiones por día |

Debajo de jSDR hay un **motor de composición tipográfica en C** escrito entre 1992 y 1997 por
4M Consultores (autor: Carlos E. Neuman), anterior al propio jSDR. Mide el texto en centímetros
y didots, silabea por patrones y justifica. **Su código fuente está completo** y recompila
limpio con gcc moderno dando resultados idénticos byte a byte.

El port **no reescribe ese motor**: lo recompila y lo sigue usando.

## Arquitectura destino

```
Browser (React + Vite + CodeMirror 6)
   │
   ▼ REST + WebSocket
API (Node + TypeScript, Fastify) ──► PostgreSQL (el MISMO esquema)
   │
   ▼
composer (Docker i386)
   ├── medir      → medición en cm y didots
   ├── sr2xp      → XPress Tags (.xtg)
   └── xtg2ind.pl → InDesign Tagged Text
                    → $JSDR_SALIDA_INDESIGN/<seccion>/<guia>.txt
```

La cola CUPS del sistema viejo (`lp -d MAC_NUE` → `mac.pl`) desaparece: el backend escribe
directo en la carpeta configurada. El contrato con los periodistas no cambia — mismo archivo,
misma carpeta, mismo formato, InDesign CS5.

## Estado

| Fase | Estado |
|---|---|
| 0 — Relevamiento y rescate | ✅ Completa |
| 1 — API + web de sólo lectura | 🔨 En curso |
| 2 — Servicio composer | ⏳ Desbloqueada |
| 3 — Editor web | ⏳ |
| 4 — Flujo, permisos y ABMs | ⏳ |
| 5 — Corte | ⏳ |

**Regla de la Fase 1: todo es SELECT.** Ni un INSERT, UPDATE o DELETE contra la base. Así la
web nueva convive con el cliente Swing sin ninguna posibilidad de pisarse.

---

## Arrancar

Requisitos: Docker y Docker Compose.

```bash
cp .env.example .env

# 1. Levantar PostgreSQL 16
docker compose up -d db

# 2. Copiar el dump de producción a ./dumps/ y restaurarlo
cp /ruta/a/jsdr-completo.dump ./dumps/
./db/restaurar-copia.sh ./dumps/jsdr-completo.dump
```

El script verifica primero que `pg_restore` 16 pueda leer el archivo custom de 8.0.3, aplica el
esquema, restaura los datos y controla los conteos de filas contra lo que había en producción.

Conexión: `postgresql://jsdr@127.0.0.1:55432/jsdr_copia`

## Estructura

```
db/
  esquema-moderno.sql     Esquema traducido de PG 8.0.3 a PG 16. Réplica fiel:
                          109 columnas, verificado una a una contra el original.
                          Al final, índices propuestos (comentados) y setval().
  restaurar-copia.sh      Restaura el dump en el Postgres local.
dumps/                    Dumps de producción. NO van al repo (.gitignore).
```

Lo que viene: `api/`, `web/`, `composer/`.

## Sobre los datos

Los dumps contienen **el archivo periodístico completo de La Capital y datos de sus usuarios**.
No se suben al repo, no se comparten y viven sólo en el entorno de desarrollo.

Las contraseñas están en **texto plano** en la base original (`varchar(10)`). Se replican tal
cual en la copia para que sea fiel; se reemplazan por hash en la Fase 5, no antes — cambiarlas
rompería el cliente Swing que sigue en producción.

## Documentación

El relevamiento completo — arquitectura, motor tipográfico, pipeline de salida, esquema,
decisiones y plan por fases — está en el proyecto **Proyecto JSDR** de Claude:

| Doc | Contenido |
|---|---|
| 01 | Análisis del cliente Swing: dominio, servicios, UI a replicar |
| 02 | Servidor, base de datos y fotocomposición |
| 03 | Motor tipográfico en C, pipeline de salida y plan de migración |
| 04 | Entorno de desarrollo y arranque de la Fase 1 |
| 05 | Servidor de producción relevado (Fedora Core 3, montajes, cadena CUPS) |
| 06 | Base de datos: esquema real, volumen y migración |
