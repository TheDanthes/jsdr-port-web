# Despliegue en ZimaOS

Todo se hace desde la interfaz web de ZimaOS. No hace falta SSH.

---

## 1. Crear las carpetas

Desde el **explorador de archivos** de ZimaOS, crear:

```
/DATA/AppData/jsdr/
/DATA/AppData/jsdr/db/
/DATA/AppData/jsdr/dumps/
/DATA/AppData/jsdr/salida-indesign/
```

`postgres/` no hace falta crearla: la crea el contenedor al arrancar.

## 2. Copiar los archivos

Subir por el explorador de archivos:

| Archivo | Destino |
|---|---|
| `db/esquema-moderno.sql` | `/DATA/AppData/jsdr/db/` |
| `db/datos-prueba.sql` | `/DATA/AppData/jsdr/db/` |
| `jsdr-completo.dump` (1,4 GB) | `/DATA/AppData/jsdr/dumps/` |

El dump tarda en subir. Si tenés Syncthing en el ZimaOS, sale más rápido por ahí.

## 3. Instalar la app

**Container Manager → Apps → + → Instalar una app personalizada → Importar**, y elegir
`docker-compose.zimaos.yml`.

Levanta dos servicios:

| Servicio | Puerto | |
|---|---|---|
| `jsdr-db` | 55432 | PostgreSQL 16 (elegido para no chocar con otro Postgres del ZimaOS) |
| `jsdr-api` | 3099 | **La aplicación entera**: la API y la web, en el mismo puerto |

> **Antes de importar, cambiá `JSDR_SECRETO_SESION`** en el compose por una cadena
> larga propia. Es lo que firma los tokens de sesión: mientras no cambie, la gente
> sigue con la sesión abierta después de un reinicio. Si se deja vacía, la API
> genera una al azar en cada arranque y todos tienen que volver a entrar.

El tercero, `jsdr-restaurador`, arranca con el stack, restaura si hace falta y se apaga.
Es **idempotente**: si la base ya tiene datos, no hace nada.

## 4. Restaurar la copia de producción

> **Container Manager no resuelve nombres de servicio entre contenedores.** El restaurador
> no logra llegar a `db` por DNS y se queda esperando. La restauración se hace **desde la
> terminal, dentro del contenedor `jsdr-db`**, que no necesita red. Es el camino probado.

En la terminal de ZimaOS (la de la app o la terminal web de desarrollo):

```sh
docker exec -it jsdr-db sh
```

Y adentro, en orden:

```sh
# 1. ¿pg_restore 16 puede leer el dump custom de 8.0.3?  (sí: Dump Version 1.10-0)
pg_restore -l /dumps/jsdr-completo.dump | head -20

# 2. Recrear la base
psql -U jsdr -d postgres -c "DROP DATABASE IF EXISTS jsdr_copia WITH (FORCE)"
psql -U jsdr -d postgres -c "CREATE DATABASE jsdr_copia ENCODING 'UTF8'"

# 3. Esquema modernizado — 17 tablas
psql -U jsdr -d jsdr_copia -v ON_ERROR_STOP=1 -f /db/esquema-moderno.sql

# 4. Datos — 1,4 GB, varios minutos
pg_restore --data-only --no-owner --disable-triggers -U jsdr -d jsdr_copia -j 2 \
  /dumps/jsdr-completo.dump

# 5. Secuencias — están al final de esquema-moderno.sql, comentadas
```

### Qué esperar

- **16 de 17 tablas quedan exactas** contra lo medido en producción el 18-sep.
- **`cables` queda en 0 de 156.** Es esperado, no un error de la restauración: la base está
  *declarada* UTF-8 pero tiene bytes **cp850** ahí adentro (`0xa4` = `ñ`), porque PostgreSQL
  8.0.3 no validaba la codificación de entrada y el ingestor de Télam nunca convirtió.
  Son 156 filas de una ventana móvil de 1 a 3 días, sin valor histórico: **se dejan así**.
  `datos-prueba.sql` tiene cables sintéticos para probar la interfaz.
- Diferencias chicas en `versiones` y `noticias` son esperables — el dump se tomó el 18-sep
  y el sistema viejo sigue produciendo. Un desvío grande sí hay que mirarlo.

Para rehacerla desde cero, repetir desde el paso 2.

## 5. Comprobar

```
http://<ip-del-zimaos>:3099/salud
```

Debería responder algo así:

```json
{ "ok": true, "fase": 1, "solo_lectura": true,
  "noticias": 1093772, "versiones": 1297497, "postgres": "16.x" }
```

Y sobre todo, **la web**:

```
http://<ip-del-zimaos>:3099/
```

Entrá con **el mismo usuario y contraseña del sistema de escritorio** — valida
contra la misma tabla `usuarios`. Deberías ver el buscador de noticias con el
millón de noticias del archivo.

Qué mirar en la primera vuelta:

1. Que tu usuario entre, y que uno cualquiera con la contraseña cambiada **no**.
2. Que el buscador traiga resultados y que los filtros de sección, estado y fecha
   achiquen la lista.
3. Que al abrir una noticia aparezca su historial de versiones.
4. **Cuánto tarda una búsqueda.** Sobre 1,3 millones de filas y con los índices que
   trae la base original, puede ir lento: es justamente lo que hay que medir para
   decidir qué índices agregar (documento 06 §4).

La suite de humo, desde cualquier máquina con `bash`, `curl` y `python3`:

```bash
API=<ip-del-zimaos>:3099 ./api/verificar.sh
```

Son 32 comprobaciones escritas para los datos sintéticos de `datos-prueba.sql`;
contra la copia real varias van a fallar por los conteos. Ahí lo que importa es
que **respondan** y que las de sesión y confidencialidad pasen.

---

## Notas de ZimaOS

**Container Manager no es Docker Compose.** Cuatro cosas que ignora, todas encontradas
a los golpes:

| No soporta | Qué pasa |
|---|---|
| `${VAR:-valor}` | No interpola: **sustituye por vacío**. Por eso este compose no tiene ni un `$` |
| `$$` (escape de `$`) | Mismo problema en scripts embebidos |
| `profiles:` | Los ignora: el contenedor **no se crea**, ni aparece en el stack |
| DNS por nombre de servicio | `PGHOST: db` **no resuelve**. De ahí que la restauración se haga dentro de `jsdr-db` |

El compose sirve para *crear* los contenedores. Cualquier trabajo que cruce contenedores
se hace desde la terminal, dentro del que tiene las herramientas.

**Bind mounts, no volúmenes con nombre.** Todo cuelga de `/DATA/AppData/jsdr/`, así que
lo ves y lo respaldás desde el explorador de archivos. Con un volumen con nombre, los
datos quedan enterrados en el almacenamiento interno de Docker.

**Respaldo.** Apagar la app y copiar `/DATA/AppData/jsdr/`. Como es una copia de trabajo
—la base real vive en La Capital— tampoco es crítico: se vuelve a restaurar del dump.

**Sólo en la LAN.** Los puertos 55432 y 3099 no deberían exponerse a internet. La base
contiene el archivo periodístico completo de La Capital y datos de sus usuarios, con las
contraseñas en texto plano heredadas del sistema viejo.

**Zona horaria.** Los contenedores van con `America/Argentina/Buenos_Aires`. Importa para
las fechas de publicación, que en la base son `date` sin zona.

## Sobre la Fase 2 (composer)

Cuando llegue el servicio de medición y fotocomposición, se suma a este mismo compose:

- Los binarios `medir` y `sr2xp` son **ELF 32-bit i386**. ZimaOS corre sobre x86_64
  (Zimaboard, Zimablade, ZimaCube son todos Intel), así que un contenedor base `i386/debian`
  corre **nativo, sin emulación**. No hace falta QEMU ni binfmt.
- Los datos del motor —`fonts/`, `formatos/`, `estilos/`, `excepciones/`— van a
  `/DATA/AppData/jsdr/motor/`, montados de sólo lectura.
- La salida ya está prevista: `JSDR_SALIDA_INDESIGN=/salida-indesign` apunta a
  `/DATA/AppData/jsdr/salida-indesign/`. En el corte, eso pasa a ser `/u/indesign`
  (NFS desde 192.168.1.5) en el servidor de La Capital.

## Portabilidad

Este compose es Docker estándar; lo específico de ZimaOS son las rutas `/DATA/AppData/`
y el bloque `x-casaos` que le da nombre e ícono en la interfaz. Para el despliegue final en
La Capital se cambian las rutas y se quita ese bloque. Para desarrollo local en la notebook
está `docker-compose.yml`, que usa rutas relativas.
