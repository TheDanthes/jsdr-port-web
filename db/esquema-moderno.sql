-- ============================================================================
--  jSDR — Esquema para PostgreSQL moderno (16/17)
--
--  Traducción del esquema original de PostgreSQL 8.0.3 (2005).
--  Estructura de tablas IDÉNTICA al original: mismos nombres de tabla, de
--  columna y tipos. Lo único que cambia es la sintaxis que las versiones
--  modernas ya no aceptan, y las claves foráneas viejas pasan a FK reales.
--
--  Uso:
--     createdb jsdr_copia
--     psql -d jsdr_copia -f esquema-moderno.sql
--     pg_restore --data-only --no-owner --disable-triggers -d jsdr_copia jsdr-completo.dump
--     psql -d jsdr_copia -f esquema-moderno.sql --set=ON_ERROR_STOP=0   # (solo la parte final: secuencias)
--
--  Al final hay una sección OPCIONAL de índices nuevos. No aplicarla hasta
--  haber restaurado los datos y medido — está separada a propósito.
-- ============================================================================

SET client_encoding = 'UTF8';
SET client_min_messages = warning;

-- ----------------------------------------------------------------------------
-- QUÉ SE CAMBIÓ RESPECTO DEL ORIGINAL, Y POR QUÉ
--
--  1. SET default_with_oids = true
--     → ELIMINADO. Los OID de tabla no existen desde PostgreSQL 12.
--
--  2. DEFAULT nextval('"noticias_id_seq"'::text)
--     → nextval() con argumento text se quitó en PostgreSQL 8.1.
--       Reemplazado por columnas `serial` (equivalente y más limpio).
--
--  3. CREATE FUNCTION plpgsql_call_handler / plpgsql_validator
--     CREATE TRUSTED PROCEDURAL LANGUAGE plpgsql
--     → ELIMINADOS. plpgsql viene incorporado desde la 9.0.
--
--  4. CREATE FUNCTION pg_file_length / pg_file_rename
--     → ELIMINADOS. Son del módulo contrib `adminpack`, no los usa jSDR.
--
--  5. CREATE CONSTRAINT TRIGGER "<unnamed>" ... EXECUTE PROCEDURE
--        "RI_FKey_check_ins"(...)
--     → Son claves foráneas en el estilo anterior a PostgreSQL 7.3 (14 triggers).
--       Las versiones modernas no aceptan esa sintaxis. Se reemplazaron por
--       FOREIGN KEY reales, preservando exactamente la misma semántica
--       (CASCADE / RESTRICT / NO ACTION según cada trigger original).
--
--  6. ALTER INDEX ... OWNER TO jsdr
--     → ELIMINADOS. No se puede cambiar el dueño de un índice por separado;
--       lo hereda de la tabla.
--
--  NADA de esto cambia la estructura de datos. Es traducción de sintaxis.
-- ----------------------------------------------------------------------------


-- ============================================================================
--  TABLAS DE CATÁLOGO
-- ============================================================================

CREATE TABLE secciones (
    id       serial                NOT NULL,
    nombre   character varying(30),
    codigo   character(2),
    CONSTRAINT secciones_pkey PRIMARY KEY (id)
);

CREATE TABLE agencias (
    id               serial                NOT NULL,
    nombre           character varying(50) NOT NULL,
    codigo           character(1)          NOT NULL,
    habilitada       boolean,
    dias_vida_util   integer,
    CONSTRAINT agencias_pkey PRIMARY KEY (id)
);

CREATE TABLE permisos (
    id           serial                NOT NULL,
    nombre       character varying(30),
    descripcion  character varying(50),
    general      boolean,
    CONSTRAINT permisos_pkey PRIMARY KEY (id)
);

CREATE TABLE usos (
    id           serial                 NOT NULL,
    numero       integer                NOT NULL,
    descripcion  character varying(50),
    texto        character varying(400),
    CONSTRAINT usos_pkey PRIMARY KEY (id)
);

CREATE TABLE diccionario (
    palabra  character varying(30) NOT NULL,
    CONSTRAINT diccionario_pkey PRIMARY KEY (palabra)
);


-- ============================================================================
--  USUARIOS Y PERMISOS
-- ============================================================================

-- NOTA: `password` es varchar(10) en texto plano. Se replica tal cual para que
-- la copia sea fiel al original. Se reemplaza por hash en la Fase 5, nunca antes.
CREATE TABLE usuarios (
    id                 serial                NOT NULL,
    username           character varying(15) NOT NULL,
    nivel              integer,
    "password"         character varying(10),
    nombre_apellido    character varying(50),
    dni                character varying(10),
    habilitado         boolean,
    font_size_editor   integer,
    font_size_bn       integer,
    font_size_bc       integer,
    CONSTRAINT usuarios_pkey PRIMARY KEY (id)
);

CREATE TABLE usuarios_secciones (
    id_usuario        integer NOT NULL,
    id_seccion        integer NOT NULL,
    seccion_default   boolean,
    CONSTRAINT usuarios_secciones_pkey PRIMARY KEY (id_usuario, id_seccion)
);

CREATE TABLE usuarios_permisos (
    id_usuario   integer NOT NULL,
    id_permiso   integer NOT NULL
);

CREATE TABLE usuarios_permisos_secciones (
    id_usuario   integer NOT NULL,
    id_permiso   integer NOT NULL,
    id_seccion   integer NOT NULL
);


-- ============================================================================
--  NOTICIAS Y VERSIONES  (el núcleo)
-- ============================================================================

CREATE TABLE noticias (
    id                       serial  NOT NULL,
    guia                     character varying(25),
    numero_version_activa    integer NOT NULL,
    numero_proxima_version   integer,
    CONSTRAINT id PRIMARY KEY (id)
);

CREATE TABLE versiones (
    id_noticia               integer               NOT NULL,
    numero                   integer               NOT NULL,
    fecha_publicacion        date,
    id_seccion               integer               NOT NULL,
    volanta                  text,
    titulo                   text,
    bajada                   text,
    cuerpo                   text,
    titular                  text,
    estado                   character varying(15) NOT NULL,
    eliminada                boolean,
    nivel                    integer,
    redactor                 character varying(20) NOT NULL,
    fotocomponedor           character varying(20),
    fecha_eliminacion        date,
    confidencial             boolean,
    nivel_redactor           integer,
    id_redactor              integer,
    medida_cm                real,
    medida_lineas            integer,
    medida_volanta_cm        real,
    medida_volanta_lineas    integer,
    medida_titulo_cm         real,
    medida_titulo_lineas     integer,
    medida_bajada_cm         real,
    medida_bajada_lineas     integer,
    medida_cuerpo_cm         real,
    medida_cuerpo_lineas     integer,
    medida_titular_cm        real,
    medida_titular_lineas    integer,
    CONSTRAINT versiones_pkey PRIMARY KEY (id_noticia, numero)
);

-- Autosave recuperable. En producción tiene ~8 filas: es transitoria.
CREATE TABLE versiones_tmp (
    id_noticia          integer               NOT NULL,
    numero              integer               NOT NULL,
    fecha_publicacion   date,
    id_seccion          integer               NOT NULL,
    volanta             text,
    titulo              text,
    bajada              text,
    cuerpo              text,
    titular             text,
    nivel               integer,
    redactor            character varying(20) NOT NULL,
    guia                character varying(25),
    confidencial        boolean,
    CONSTRAINT versiones_tmp_pkey PRIMARY KEY (id_noticia, numero)
);


-- ============================================================================
--  CABLES DE AGENCIAS
-- ============================================================================

CREATE TABLE cables (
    id                serial                 NOT NULL,
    numero            integer                NOT NULL,
    prioridad         character(1),
    fecha_recepcion   date                   NOT NULL,
    hora_recepcion    time without time zone NOT NULL,
    tema              character varying(5),
    titulo            character varying(100) NOT NULL,
    cuerpo            text,
    id_agencia        integer                NOT NULL,
    medida_cm         real,
    medida_lineas     integer,
    CONSTRAINT cables_pkey PRIMARY KEY (id)
);

CREATE TABLE cables_leidos (
    id_usuario   integer NOT NULL,
    id_cable     integer NOT NULL,
    CONSTRAINT cables_leidos_pkey PRIMARY KEY (id_usuario, id_cable)
);

-- NOTA: `username` es texto libre, NO una FK a usuarios.id. Así está en el
-- original; se replica igual.
CREATE TABLE reservas_cables (
    id_cable   integer               NOT NULL,
    username   character varying(15) NOT NULL,
    fecha      date                  NOT NULL,
    CONSTRAINT pk_reserva PRIMARY KEY (id_cable, username, fecha)
);


-- ============================================================================
--  COMANDOS Y NOTAS
-- ============================================================================

CREATE TABLE comandos (
    id           serial                 NOT NULL,
    nombre       character varying(30)  NOT NULL,
    valor        character varying(100) NOT NULL,
    id_seccion   integer,
    id_usuario   integer,
    CONSTRAINT comandos_pkey PRIMARY KEY (id)
);

-- 0 filas en producción: la función "Mis Notas" nunca se usó.
CREATE TABLE notas (
    id                serial                 NOT NULL,
    id_usuario        integer                NOT NULL,
    nombre            character varying(100) NOT NULL,
    contenido         text,
    fecha_creacion    date,
    fecha_um          date,
    CONSTRAINT notas_pkey PRIMARY KEY (id)
);


-- ============================================================================
--  CLAVES FORÁNEAS
--
--  Las 8 primeras ya eran FK reales en el original.
--  Las 3 últimas venían como CONSTRAINT TRIGGER al estilo pre-7.3 y se
--  traducen acá, con la misma semántica que tenían.
-- ============================================================================

-- Ya eran FK reales en el original
ALTER TABLE ONLY cables
    ADD CONSTRAINT id_agencia FOREIGN KEY (id_agencia)
    REFERENCES agencias(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY cables_leidos
    ADD CONSTRAINT cables_leidos_id_cable_fkey FOREIGN KEY (id_cable)
    REFERENCES cables(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY reservas_cables
    ADD CONSTRAINT id_cable FOREIGN KEY (id_cable)
    REFERENCES cables(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY versiones
    ADD CONSTRAINT id_noticia FOREIGN KEY (id_noticia)
    REFERENCES noticias(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY versiones
    ADD CONSTRAINT id_seccion FOREIGN KEY (id_seccion)
    REFERENCES secciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY versiones
    ADD CONSTRAINT id_redactor FOREIGN KEY (id_redactor)
    REFERENCES usuarios(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY usuarios_secciones
    ADD CONSTRAINT seccion FOREIGN KEY (id_seccion)
    REFERENCES secciones(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE ONLY usuarios_permisos_secciones
    ADD CONSTRAINT us FOREIGN KEY (id_usuario, id_seccion)
    REFERENCES usuarios_secciones(id_usuario, id_seccion)
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Traducidas desde los CONSTRAINT TRIGGER viejos
--   RI_FKey_cascade_del  → ON DELETE CASCADE
--   RI_FKey_restrict_del → ON DELETE RESTRICT
--   RI_FKey_noaction_upd → ON UPDATE NO ACTION
ALTER TABLE ONLY usuarios_permisos
    ADD CONSTRAINT usuarios_permisos_usuario_fkey FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id) ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE ONLY usuarios_permisos
    ADD CONSTRAINT usuarios_permisos_permiso_fkey FOREIGN KEY (id_permiso)
    REFERENCES permisos(id) ON UPDATE NO ACTION ON DELETE RESTRICT;

ALTER TABLE ONLY usuarios_secciones
    ADD CONSTRAINT usuarios_secciones_usuario_fkey FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id) ON UPDATE NO ACTION ON DELETE CASCADE;


-- ============================================================================
--  ÍNDICES ORIGINALES  (los 5 que existen en producción, tal cual)
-- ============================================================================

CREATE INDEX cables_fecrec ON cables USING btree (fecha_recepcion, hora_recepcion);
CREATE INDEX eliminada     ON versiones USING btree (eliminada);
CREATE INDEX fecha_publicacion ON versiones USING btree (fecha_publicacion);
CREATE INDEX idx_nivel     ON versiones USING btree (nivel);
CREATE UNIQUE INDEX id_numero_version_activa ON noticias USING btree (id, numero_version_activa);


-- ============================================================================
--  FIN DE LA RÉPLICA FIEL.
--  Lo que sigue es OPCIONAL y sólo para la copia de desarrollo.
-- ============================================================================
--
--  ÍNDICES ADICIONALES PROPUESTOS
--
--  El buscador de noticias filtra por sección, estado, redactor, guía, nivel y
--  rango de fechas sobre una tabla de 1.297.497 filas, y en producción NO hay
--  índice para sección, estado, redactor ni guía. Los dos índices que sí
--  existen — `eliminada` (booleano) e `idx_nivel` (3 valores) — tienen
--  cardinalidad tan baja que el planner casi nunca los usa.
--
--  Esto explica que las búsquedas sean lentas hoy. MEDIDO sobre la copia real
--  en el ZimaOS: entre 4,6 y 6,1 segundos por búsqueda.
--
--  NO aplicar esto contra producción. Va en la copia restaurada.
-- ----------------------------------------------------------------------------
--
--  POR QUÉ EL ORDEN DEL ÍNDICE TIENE QUE COINCIDIR CON EL ORDER BY
--
--  Primer intento: índices "obvios" sobre (id_seccion, fecha DESC), (estado,
--  fecha DESC), (redactor), etc. Resultado medido sobre las 1.297.497 filas
--  reales: 1.0x. Ni un milisegundo de mejora. El planificador los ignoró.
--
--  La razón es el ORDER BY que emite el buscador:
--
--      ORDER BY v.fecha_publicacion DESC NULLS LAST, v.id_noticia DESC
--
--  Un índice declarado `DESC` en PostgreSQL es, por defecto, DESC NULLS FIRST.
--  Esa sola diferencia —dónde van los nulos— lo vuelve inservible para
--  satisfacer este ORDER BY, así que el planificador desiste de ordenar por
--  índice, recorre la tabla entera, hace el hash join completo con `noticias`,
--  ordena 1,09 millones de filas y recién ahí toma las 30 que se muestran.
--
--  Con el orden declarado igual que el ORDER BY —incluido el segundo criterio,
--  `id_noticia DESC`— el plan cambia por completo: recorre el índice ya
--  ordenado, entra a `noticias` por su clave primaria y frena a las 30 filas.
--
--  Verificado sobre 1.297.497 filas generadas con la misma distribución de la
--  base real (mismos conteos por estado, 1,19 versiones por noticia):
--
--      sin filtros, por fecha    1253 ms  ->  0,6 ms
--      por sección                          1,1 ms
--      por estado                           0,9 ms
--      por redactor                         1,0 ms
--
--  La lección, para cuando aparezcan órdenes nuevos: un índice sirve para
--  ordenar sólo si su orden declarado coincide EXACTAMENTE con el del ORDER BY,
--  nulos incluidos.
-- ----------------------------------------------------------------------------

-- Los índices NO se crean acá: crearlos antes de `pg_restore` haría que la
-- carga de 1,3 millones de filas tuviera que mantenerlos fila por fila.
-- Van en `indices.sql`, que se aplica DESPUÉS de restaurar los datos:
--
--     psql -U jsdr -d jsdr_copia -f /db/indices.sql
--
-- ----------------------------------------------------------------------------
--  LO QUE NINGÚN ÍNDICE ARREGLA: el conteo exacto
--
--  `SELECT count(*)` sobre el join completo cuesta ~950 ms medidos, con o sin
--  índices: para decir "1.093.772" hay que recorrer todo, no hay atajo.
--
--  La salida no es un índice sino no pedir el número exacto. La API acota el
--  conteo a 1000 y muestra "más de 1.000" cuando se pasa:
--
--      SELECT count(*) FROM (SELECT 1 ... LIMIT 1001) t     -- 950 ms -> 3 ms
--
--  Nadie navega hasta la página 36.000; el que busca en serio filtra.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
--  HUECO DE INTEGRIDAD: `usuarios.username` no tiene restricción UNIQUE, pese
--  a que el login busca por username. Verificar si hay duplicados en la copia:
--
--     SELECT username, count(*) FROM usuarios GROUP BY username HAVING count(*) > 1;
--
--  Si no hay, conviene agregarlo en el sistema nuevo:
-- CREATE UNIQUE INDEX ux_usuarios_username ON usuarios (username);
-- ----------------------------------------------------------------------------


-- ============================================================================
--  DESPUÉS DE RESTAURAR LOS DATOS: reajustar las secuencias
--  (pg_restore --data-only no las mueve)
-- ============================================================================
--
-- SELECT setval('noticias_id_seq',  (SELECT max(id) FROM noticias));
-- SELECT setval('usuarios_id_seq',  (SELECT max(id) FROM usuarios));
-- SELECT setval('secciones_id_seq', (SELECT max(id) FROM secciones));
-- SELECT setval('permisos_id_seq',  (SELECT max(id) FROM permisos));
-- SELECT setval('agencias_id_seq',  (SELECT max(id) FROM agencias));
-- SELECT setval('cables_id_seq',    (SELECT max(id) FROM cables));
-- SELECT setval('comandos_id_seq',  (SELECT max(id) FROM comandos));
-- SELECT setval('usos_id_seq',      (SELECT max(id) FROM usos));
-- SELECT setval('notas_id_seq',     COALESCE((SELECT max(id) FROM notas), 1));
