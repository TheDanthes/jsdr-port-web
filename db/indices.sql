-- ============================================================================
--  jSDR — Índices del buscador
--
--  SE APLICA DESPUÉS DE RESTAURAR LOS DATOS, nunca antes: con los índices ya
--  creados, `pg_restore` tendría que mantenerlos fila por fila durante la carga
--  de 1,3 millones de filas.
--
--      psql -U jsdr -d jsdr_copia -f /db/indices.sql
--
--  Tarda unos minutos y ocupa ~380 MB. NO aplicar contra producción: la base
--  vieja sigue sacando el diario, esto es trabajo de la copia.
-- ============================================================================
--
--  POR QUÉ CADA ÍNDICE ESTÁ DECLARADO ASÍ
--
--  Un índice sirve para ordenar sólo si su orden declarado coincide EXACTAMENTE
--  con el del ORDER BY: misma dirección en cada columna y mismo lugar para los
--  nulos. Una sola diferencia y el planificador desiste, recorre la tabla
--  entera, hace el hash join completo con `noticias`, ordena un millón de filas
--  y recién ahí toma las 30 que se muestran.
--
--  Eso fue exactamente lo que pasó con el primer intento de índices —
--  (id_seccion, fecha DESC), (estado, fecha DESC), (redactor)— sobre la copia
--  real: 1.0x, ni un milisegundo de mejora, porque el buscador pide
--  `fecha DESC NULLS LAST` y un índice DESC es, por defecto, NULLS FIRST.
--
--  Los de acá abajo llevan las tres columnas en la misma dirección y con los
--  nulos en el mismo lugar que emite la API. Con eso cada índice sirve para
--  DOS cosas a la vez:
--    · filtrar por esa columna y ordenar por fecha (igualdad en la primera)
--    · ordenar por esa columna, hacia adelante o hacia atrás
--
--  Todos son parciales por `eliminada = false`, que es condición fija del
--  buscador: así no guardan las filas borradas.
--
--  MEDIDO extremo a extremo (HTTP, no SQL) sobre 1.297.497 filas generadas con
--  la distribución de la base real:
--
--      primera pantalla        1900 ms  ->   8 ms
--      por sección                          15 ms
--      por estado                            6 ms
--      por redactor                         10 ms
--      ordenar por estado      2050 ms  ->   8 ms
--      ordenar por redactor    2083 ms  ->   6 ms
--      ordenar por título      1910 ms  ->  13 ms
--      ordenar por guía         301 ms  ->   8 ms
--      texto inexistente        472 ms  ->   5 ms
-- ============================================================================


-- ----------------------------------------------------------------------------
--  LIMPIEZA: índices de un intento anterior que NO servían.
--  Medidos sobre la copia real: 1.0x, ni un milisegundo de mejora, porque su
--  orden declarado no coincide con el del ORDER BY (ver más arriba). Ocupan
--  ~70 MB sin hacer nada. Si nunca se crearon, estas líneas no hacen daño.
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS ix_versiones_seccion_fecha;
DROP INDEX IF EXISTS ix_versiones_estado_fecha;
DROP INDEX IF EXISTS ix_versiones_redactor;
DROP INDEX IF EXISTS ix_versiones_id_redactor;
DROP INDEX IF EXISTS ix_versiones_no_eliminadas;
DROP INDEX IF EXISTS ix_noticias_guia;   -- lo reemplaza ix_n_guia_orden


-- --- el orden por defecto: lo más nuevo primero -----------------------------
CREATE INDEX IF NOT EXISTS ix_v_fecha_orden
    ON versiones (fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 28 MB

-- --- filtrar por columna, y ordenar por ella --------------------------------
CREATE INDEX IF NOT EXISTS ix_v_seccion_orden
    ON versiones (id_seccion DESC NULLS LAST,
                  fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 39 MB

CREATE INDEX IF NOT EXISTS ix_v_estado_orden
    ON versiones (estado DESC NULLS LAST,
                  fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 50 MB

CREATE INDEX IF NOT EXISTS ix_v_redactor_orden
    ON versiones (redactor DESC NULLS LAST,
                  fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 39 MB

-- La guía vive en `noticias`, no en `versiones`.
CREATE INDEX IF NOT EXISTS ix_n_guia_orden
    ON noticias (guia DESC NULLS LAST, id DESC);                    -- 46 MB

-- --- búsqueda por texto en el título ----------------------------------------
-- El campo "Noticia:" del buscador hace ILIKE '%texto%'. Con comodín adelante
-- ningún índice común sirve; sin esto, un término poco frecuente obliga a
-- recorrer el índice entero.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS ix_v_titulo_trgm
    ON versiones USING gin (titulo gin_trgm_ops);                   -- 64 MB


-- ============================================================================
--  OPCIONALES — sólo si se usan esos ordenamientos
--  Son 112 MB para dos columnas de la tabla que casi nadie ordena. Si el
--  espacio aprieta, estos dos son los primeros que sobran.
-- ============================================================================

-- Por los primeros 200 caracteres, NO por el título entero.
--
-- `titulo` es `text` sin límite y en la base real hay títulos de casi 7 KB. Un
-- btree no puede indexar un valor mayor a 2704 bytes, así que el índice sobre
-- la columna completa FALLA al crearse con los datos de producción:
--
--     ERROR: index row size 5784 exceeds btree version 4 maximum 2704
--
-- Ordenar por los primeros 200 caracteres es indistinguible de ordenar por el
-- título completo. La expresión tiene que coincidir EXACTAMENTE con la que
-- emite la API (`left(v.titulo, 200)`), o el planificador no usa el índice.
CREATE INDEX IF NOT EXISTS ix_v_titulo_orden
    ON versiones (left(titulo, 200) DESC NULLS LAST,
                  fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 73 MB

CREATE INDEX IF NOT EXISTS ix_v_nivel_orden
    ON versiones (nivel DESC NULLS LAST,
                  fecha_publicacion DESC NULLS LAST, id_noticia DESC)
    WHERE eliminada = false;                                        -- 39 MB


-- ============================================================================
--  LO QUE NO SE ARREGLA CON ÍNDICES
--
--  1. Ordenar por SECCIÓN sigue costando ~1,9 s.
--     El buscador ordena por el NOMBRE de la sección, que vive en la tabla
--     `secciones`; ningún índice sobre `versiones` puede ordenar por una
--     columna de otra tabla. Ordenar por `id_seccion` sí sería instantáneo,
--     pero el orden resultante no es el alfabético que espera quien mira la
--     columna "Secc.".
--     La salida real es denormalizar el código de sección dentro de
--     `versiones`, y eso es una escritura: va en la Fase 4.
--     Mientras tanto: FILTRAR por sección tarda 15 ms, y es lo que la gente
--     hace de verdad.
--
--  2. El conteo exacto. `count(*)` sobre el join completo cuesta ~950 ms con o
--     sin índices: para decir "1.093.772" hay que recorrer todo.
--     La API no lo pide: acota el conteo a 1000 y la web muestra "más de
--     1.000". Eso lo deja en ~3 ms.
-- ============================================================================


-- ============================================================================
--  Auxiliares para pantallas que todavía no aprietan. Se pueden dejar para
--  después; con 156 cables y 31 lecturas, hoy no cambian nada.
-- ============================================================================
-- CREATE INDEX ix_cables_agencia        ON cables (id_agencia);
-- CREATE INDEX ix_reservas_username     ON reservas_cables (username);
-- CREATE INDEX ix_cables_leidos_usuario ON cables_leidos (id_usuario);
-- CREATE INDEX ix_comandos_seccion      ON comandos (id_seccion);
-- CREATE INDEX ix_comandos_usuario      ON comandos (id_usuario);


-- Sin esto los índices existen pero el planificador no sabe cómo son.
ANALYZE versiones;
ANALYZE noticias;
