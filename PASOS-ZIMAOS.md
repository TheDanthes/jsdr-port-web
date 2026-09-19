# Pasos en ZimaOS — en orden

Dos etapas separadas a propósito. La primera valida la base sin depender de nada
más; la segunda suma la API.

---

# Etapa 1 — Sólo la base ✅ HECHA

## 1.1 Importar el compose

**Container Manager → Apps → + → Instalar una app personalizada → Importar**, y elegir
**`docker-compose.zimaos-db.yml`** (el que dice `-db`, no el otro).

Levanta `jsdr-db`: PostgreSQL 16 en el puerto **55432**. Sólo usa la imagen
`postgres:16-alpine`, que se baja de Docker Hub. No construye nada, así que entra
limpio en Container Manager.

## 1.2 Restaurar — desde la terminal, dentro de `jsdr-db`

> El contenedor `jsdr-restaurador` existe y es idempotente, pero **Container Manager no
> resuelve nombres de servicio entre contenedores**: no llega a `db` por DNS y se queda
> esperando. La restauración se hace adentro de `jsdr-db`, que no necesita red.

```sh
docker exec -it jsdr-db sh
```

Y adentro:

```sh
# 1. ¿pg_restore 16 lee el dump custom de 8.0.3?
pg_restore -l /dumps/jsdr-completo.dump | head -20
#    Respuesta: SÍ. Dump Version 1.10-0, Format CUSTOM, 98 TOC entries.

# 2. Recrear la base
psql -U jsdr -d postgres -c "DROP DATABASE IF EXISTS jsdr_copia WITH (FORCE)"
psql -U jsdr -d postgres -c "CREATE DATABASE jsdr_copia ENCODING 'UTF8'"

# 3. Esquema modernizado — 17 tablas
psql -U jsdr -d jsdr_copia -v ON_ERROR_STOP=1 -f /db/esquema-moderno.sql

# 4. Datos — 1,4 GB, varios minutos
pg_restore --data-only --no-owner --disable-triggers -U jsdr -d jsdr_copia -j 2 \
  /dumps/jsdr-completo.dump

# 5. Secuencias — el bloque setval() del final de esquema-moderno.sql
```

Se puede repetir cuantas veces haga falta: el paso 2 recrea la base desde cero.

## 1.3 Resultado obtenido

**16 de 17 tablas exactas** contra producción:

```
versiones 1.297.497 · noticias 1.093.772 · diccionario 378.948
usuarios_permisos_secciones 656 · usuarios_secciones 635 · usos 297 · comandos 255
usuarios 170 · reservas_cables 156 · usuarios_permisos 56 · cables_leidos 31
secciones 26 · agencias 14 · permisos 9 · versiones_tmp 8 · notas 0
```

**`cables` quedó en 0 de 156, y es esperado.** La base está *declarada* UTF-8 pero tiene
bytes **cp850** adentro (`0xa4` = `ñ`): PostgreSQL 8.0.3 no validaba la codificación de
entrada y el ingestor de Télam nunca convirtió. PostgreSQL 16 sí valida, y el `COPY` corta.

Son 156 filas de una ventana móvil de 1 a 3 días, sin valor histórico — mañana en producción
son otras 156. **Se dejan así**; `datos-prueba.sql` tiene cables sintéticos para la interfaz.
Lo que sí queda es un requisito firme para la Fase 4: **el ingestor de cables convierte
cp850 → UTF-8 en la entrada.**

Comprobación rápida desde cualquier máquina de la red:

```
host 192.168.x.x   puerto 55432   base jsdr_copia   usuario jsdr   contraseña jsdr_dev
```

---

# Etapa 2 — La API (después de que la etapa 1 funcione)

Container Manager **no construye imágenes**, sólo baja las que ya existen. Así que la
imagen se construye en GitHub Actions y el ZimaOS la baja hecha.

## 2.1 Subir el repo

```bash
cd F:\SYNCTHINGS\jsdr\jsdr-port-web
git init -b main
git add .
git commit -m "Base del proyecto: entorno, esquema y API de lectura"
git remote add origin https://github.com/TheDanthes/jsdr-port-web.git
git push -u origin main
```

El `.gitignore` ya excluye `dumps/`, así que la base de La Capital no se sube.

## 2.2 Construir la imagen

Con el push ya se dispara solo: `.github/workflows/build-api.yml` corre ante cualquier
cambio en `api/`. También se puede lanzar a mano desde la pestaña **Actions** del repo
(**Construir imagen de la API → Run workflow**).

Tarda un par de minutos. Al terminar publica:

```
ghcr.io/thedanthes/jsdr-api:latest
ghcr.io/thedanthes/jsdr-api:<sha del commit>
```

No hace falta crear ningún token: el workflow usa el `GITHUB_TOKEN` que Actions ya
provee. Lo único necesario es el permiso `packages: write`, que está declarado en el
propio archivo.

## 2.3 Autenticar el ZimaOS contra GHCR

**Acá está el detalle que hay que tener presente.** El repo es privado, así que el
paquete también nace privado, y el ZimaOS no puede bajarlo sin credenciales.

Hace falta un **Personal Access Token (classic)** con el permiso **`read:packages`**,
y sólo ése:

1. GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)**
2. Generate new token (classic), marcar **únicamente `read:packages`**
3. Copiar el token

Y una sola vez en la terminal de ZimaOS:

```sh
docker login ghcr.io -u TheDanthes
# contraseña: el token, no la de GitHub
```

Queda guardado en `/root/.docker/config.json`. No hay que repetirlo.

> La alternativa sería hacer público el paquete y saltear este paso. No lo recomiendo:
> la imagen lleva adentro el código de la API del diario.

## 2.4 Cambiar al compose completo

En Container Manager, eliminar la app de la etapa 1 e importar **`docker-compose.zimaos.yml`**
(el completo). Trae `db` + `api` + `restaurador`.

**Los datos no se pierden**: viven en `/DATA/AppData/jsdr/postgres/`, que es un bind mount.
Al levantar de nuevo, PostgreSQL los encuentra tal cual.

## 2.5 Comprobar

```
http://<ip-del-zimaos>:3099/salud     la API
http://<ip-del-zimaos>:3099/          la web
```

`/salud` responde algo así:

```json
{ "ok": true, "fase": 1, "solo_lectura": true,
  "noticias": 1093772, "versiones": 1297497, "postgres": "16.x" }
```

Y en la web entrás con **el mismo usuario y contraseña del sistema de escritorio**:
valida contra la misma tabla `usuarios`.

La suite de humo, desde cualquier máquina con `bash`, `curl` y `python3`:

```bash
API=<ip-del-zimaos>:3099 ./api/verificar.sh
```

Son 32 comprobaciones. Contra la copia real de producción varias van a fallar —
están escritas para los datos sintéticos de `datos-prueba.sql`, no para el millón y medio
de filas reales. Lo que importa ahí es que **respondan** y que pasen las de sesión y
confidencialidad, que no dependen de los conteos.

---

## Por qué en dos etapas

La restauración es el paso que valida el trabajo de esquema: la traducción de PostgreSQL
8.0.3 a 16, las claves foráneas reescritas, y sobre todo la compatibilidad de `pg_restore`.
Si eso se mezcla con montar CI y resolver autenticación de registry, y algo falla, no se
sabe qué rompió.

Primero la base, con dos piezas conocidas. Después la imagen.

Salió bien: separarlas dejó a la vista tanto que `pg_restore` 16 sí lee el formato de 8.0.3
como que la base nunca fue UTF-8 limpio. Mezclado con CI, ese `0xa4` habría parecido un
problema de despliegue.
