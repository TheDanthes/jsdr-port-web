# Instalar jSDR en un ZimaOS nuevo — checklist

> Estado al 2026-09-20: **Fase 1 completa** (base + API + web) y **Fase 2** (composer)
> construida y verificada. Esta guía deja un ZimaOS nuevo igual que el de La Capital
> (192.168.3.100), restaurando el **dump real completo**.
>
> Todo por la interfaz web de ZimaOS (Container Manager + explorador de archivos) y la
> terminal web. Nada de SSH.

Resultado final:

| Contenedor | Puerto | Qué es |
|---|---|---|
| `jsdr-db` | 55432 | PostgreSQL 16 con la copia de producción + índices |
| `jsdr-api` | 3099 | La aplicación entera: API + web |
| `jsdr-composer` | 3098 | Motor tipográfico (medir / sr2xp / xtg2ind.pl) |

Tiempo estimado: 1 a 2 horas, casi todo esperando la subida y la restauración del dump.

---

## 0. Antes de ir al equipo nuevo (en la PC de desarrollo)

- [ ] **Subir los dos compose del composer, que todavía no están en GitHub.**
      `docker-compose.zimaos-composer.yml` y `docker-compose.zimaos-composer-local.yml`
      están sin trackear. Agregar **sólo esos dos** — no `git add .`: el working copy tiene
      además 23 archivos de `composer/motor/` y `build-api.yml` que figuran modificados
      únicamente por finales de línea (CRLF), y no conviene mezclarlos.
      ```bash
      git add docker-compose.zimaos-composer.yml docker-compose.zimaos-composer-local.yml INSTALAR-EQUIPO-NUEVO.md
      git commit -m "Compose del composer y guia de instalacion en equipo nuevo"
      git push
      ```
- [ ] **Confirmar en GitHub → Actions** que las dos últimas corridas están en verde:
      *Construir imagen de la API* y *Construir imagen del composer*.
      Si la del composer tiene más de 30 días, el archivo descargable ya expiró:
      **Run workflow** a mano para regenerarlo.
- [ ] **Token de GitHub** (si no tenés uno a mano): Settings → Developer settings →
      Personal access tokens → **Tokens (classic)** → sólo **`read:packages`**.
      Sirve para bajar las dos imágenes privadas de GHCR.
- [ ] **Tener a mano los archivos a copiar** (salen de `F:\SYNCTHINGS\jsdr`):

      | Archivo | Origen |
      |---|---|
      | `esquema-moderno.sql`, `indices.sql`, `medir-buscador.sh`, `datos-prueba.sql` | `jsdr-port-web\db\` |
      | `jsdr-completo.dump` (1,4 GB) | `jsdr-base\` (o `/DATA/AppData/jsdr/dumps/` del ZimaOS actual) |
      | `docker-compose.zimaos.yml`, `docker-compose.zimaos-composer.yml` | `jsdr-port-web\` |

## 1. Requisitos del ZimaOS nuevo

- [ ] **amd64** (x86_64). Las imágenes no se publican para ARM.
- [ ] **~10 GB libres** en `/DATA`: dump 1,4 GB + base restaurada + 304 MB de índices + imágenes.
- [ ] **Puertos libres: 55432, 3099, 3098.**
- [ ] **IP fija** (reserva DHCP o estática). Anotarla: `IP_NUEVA = ______________`.
      La API se conecta a la base **por esa IP**, así que no puede cambiar.

## 2. Carpetas y archivos

- [ ] Con el explorador de archivos de ZimaOS, crear:
      ```
      /DATA/AppData/jsdr/db/
      /DATA/AppData/jsdr/dumps/
      /DATA/AppData/jsdr/salida-indesign/
      ```
      (`postgres/` la crea el contenedor.)
- [ ] Subir los cuatro archivos de `db/` a `/DATA/AppData/jsdr/db/`.
- [ ] Subir `jsdr-completo.dump` a `/DATA/AppData/jsdr/dumps/`.
      Tarda: si el ZimaOS tiene Syncthing, conviene por ahí.
- [ ] Verificar que el dump llegó entero: **1.416.325.695 bytes**.

## 3. Login en GHCR (una sola vez)

En la terminal del ZimaOS:

```sh
sudo docker login ghcr.io -u TheDanthes
# contraseña: el token read:packages, NO la de GitHub
sudo docker pull ghcr.io/thedanthes/jsdr-api:latest
sudo docker pull ghcr.io/thedanthes/jsdr-composer:latest
```

- [ ] Los dos `pull` terminan sin error.

> **Sin token** (alternativa): el composer se puede cargar desde el archivo
> `jsdr-composer-imagen` de Actions (`gunzip -c jsdr-composer.tar.gz | sudo docker load`)
> y usar `docker-compose.zimaos-composer-local.yml`. La API **no** tiene archivo
> descargable: sin token hay que copiar el repo al ZimaOS y hacer
> `sudo docker build -t jsdr-api:local /DATA/AppData/jsdr/repo`, y usar
> `docker-compose.zimaos-local.yml` — **corrigiendo antes su `DATABASE_URL`**, que
> apunta a `db:5432` y eso no resuelve en Container Manager (ver §8).

## 4. Editar `docker-compose.zimaos.yml` ANTES de importar

Dos cambios, los dos en el servicio `api`:

- [ ] **La IP.** Reemplazar `192.168.3.100` por la IP del equipo nuevo:
      ```yaml
      DATABASE_URL: postgresql://jsdr:jsdr_dev@IP_NUEVA:55432/jsdr_copia
      ```
- [ ] **El secreto de sesión.** Cambiar `cambiar-esta-cadena-por-una-propia-larga`
      por una cadena larga y propia (40+ caracteres). No reusar la de La Capital.

Y una regla: **nada de `${...}`** en el archivo. Container Manager no interpola
variables: las reemplaza por vacío. Todo literal.

## 5. Levantar la base y restaurar

- [ ] **Container Manager → Apps → + → Instalar una app personalizada → Importar**
      → `docker-compose.zimaos.yml` (el editado).
- [ ] Esperar a que `jsdr-db` quede **healthy**. `jsdr-api` puede quedar reiniciando:
      es normal hasta que la base tenga datos.
- [ ] `jsdr-restaurador` **no está** en este compose — la restauración se hace a mano,
      dentro de `jsdr-db`, que es el camino probado.

En la terminal:

```sh
sudo docker exec -it jsdr-db sh
```

Y adentro, en orden:

```sh
# 1. pg_restore 16 lee el dump de 8.0.3 → tiene que mostrar "Dump Version: 1.10-0"
pg_restore -l /dumps/jsdr-completo.dump | head -8

# 2. Base limpia
psql -U jsdr -d postgres -c "DROP DATABASE IF EXISTS jsdr_copia WITH (FORCE)"
psql -U jsdr -d postgres -c "CREATE DATABASE jsdr_copia ENCODING 'UTF8'"

# 3. Esquema modernizado (17 tablas). Tiene que terminar sin ERROR.
psql -U jsdr -d jsdr_copia -v ON_ERROR_STOP=1 -f /db/esquema-moderno.sql

# 4. Datos — varios minutos. Va a quejarse de "cables": es esperado (ver abajo).
pg_restore --data-only --no-owner --disable-triggers -U jsdr -d jsdr_copia -j 2 \
  /dumps/jsdr-completo.dump

# 5. Secuencias
psql -U jsdr -d jsdr_copia -c "
  SELECT setval('noticias_id_seq',  COALESCE((SELECT max(id) FROM noticias),1));
  SELECT setval('usuarios_id_seq',  COALESCE((SELECT max(id) FROM usuarios),1));
  SELECT setval('secciones_id_seq', COALESCE((SELECT max(id) FROM secciones),1));
  SELECT setval('permisos_id_seq',  COALESCE((SELECT max(id) FROM permisos),1));
  SELECT setval('agencias_id_seq',  COALESCE((SELECT max(id) FROM agencias),1));
  SELECT setval('cables_id_seq',    COALESCE((SELECT max(id) FROM cables),1));
  SELECT setval('comandos_id_seq',  COALESCE((SELECT max(id) FROM comandos),1));
  SELECT setval('usos_id_seq',      COALESCE((SELECT max(id) FROM usos),1));
  SELECT setval('notas_id_seq',     COALESCE((SELECT max(id) FROM notas),1));"

# 6. Índices del buscador + ANALYZE. IMPRESCINDIBLE y DESPUÉS de los datos.
psql -U jsdr -d jsdr_copia -v ON_ERROR_STOP=1 -f /db/indices.sql

# 7. Control
psql -U jsdr -d jsdr_copia -c "SELECT
  (SELECT count(*) FROM versiones) AS versiones,
  (SELECT count(*) FROM noticias)  AS noticias,
  (SELECT count(*) FROM usuarios)  AS usuarios,
  (SELECT count(*) FROM cables)    AS cables"
exit
```

Qué esperar en el paso 7:

| | Esperado |
|---|---:|
| versiones | 1.297.497 |
| noticias | 1.093.772 |
| usuarios | 170 |
| cables | **0** ← correcto |

- `cables` queda en 0 a propósito: tiene bytes cp850 que PostgreSQL 16 rechaza
  (`invalid byte sequence ... 0xa4`). Son 156 filas de una ventana de 1–3 días. Doc 06 §7.
- Si el paso 6 da `index row size ... exceeds btree` es que el `indices.sql` copiado
  es viejo: tiene que ser el que indexa `left(titulo, 200)`.

- [ ] Conteos OK.
- [ ] En Container Manager, **reiniciar `jsdr-api`**.

## 6. Levantar el composer

- [ ] **Importar** `docker-compose.zimaos-composer.yml` (stack aparte, `jsdr-composer`).
      No toca la base; no hay nada que editar.
- [ ] Queda **healthy** en Container Manager.

## 7. Comprobar

- [ ] `http://IP_NUEVA:3099/salud` → `"ok": true`, `noticias: 1093772`, `"solo_lectura": true`
- [ ] `http://IP_NUEVA:3099/` → login con **usuario y contraseña del jSDR de escritorio**
- [ ] Un usuario con contraseña incorrecta **no** entra (401)
- [ ] El buscador responde **al instante**. Si tarda segundos: faltan los índices o el ANALYZE (§5 paso 6)
- [ ] Abrir una noticia → aparece el historial de versiones
- [ ] `http://IP_NUEVA:3098/salud` → responde el composer
- [ ] Medir algo desde la terminal del ZimaOS:
      ```sh
      curl -s -X POST http://127.0.0.1:3098/medir \
        -H 'Content-Type: application/json' \
        -d '{"texto":"Prueba de medicion del motor tipografico."}'
      ```
      Devuelve `cm`, `didots` y `ms` (unos 5 ms).
- [ ] Opcional, desde una máquina con bash + curl + python3:
      `API=IP_NUEVA:3099 ./api/verificar.sh` — contra datos reales fallan las de conteos;
      tienen que pasar las de **sesión y confidencialidad**.

---

## 8. Trampas conocidas de Container Manager

| Síntoma | Causa | Arreglo |
|---|---|---|
| Postgres aborta: *"superuser password is not specified"* | Se usó `${VAR:-valor}`; Container Manager lo deja vacío | Valores literales |
| Un servicio "desaparece" del stack | Usa `profiles:` y los ignora | Sin perfiles |
| La API no conecta a la base (`ENOTFOUND db`) | No hay DNS por nombre de servicio | `IP_NUEVA:55432` en `DATABASE_URL` |
| El compose del composer no está en el repo clonado | Quedó sin commitear | §0 |
| Todos pierden la sesión en cada reinicio | `JSDR_SECRETO_SESION` vacío | Cadena fija en el compose |
| `docker: permission denied` | Terminal sin root | Anteponer `sudo` |

## 9. Qué NO queda hecho con esta instalación

- La web es **sólo lectura** (el pool abre las conexiones con `default_transaction_read_only`).
  Convive con el cliente Swing sin tocarlo.
- `salida-indesign/` es local. En producción es `/u/indesign` (NFS desde el servidor
  del diario); se cambia recién en el corte.
- La copia de la base es la del 18-sep-2026. Para refrescarla: dump nuevo y repetir §5.
- Pendiente del proyecto, no de la instalación: la prueba con alguien de la redacción,
  comparar el composer contra un `.txt` real de `/u/indesign`, y la Fase 3 (editor).
