#!/bin/sh
#-----------------------------------------------------------------------------
#  jSDR — aplicar los índices del buscador y comprobar la mejora.
#
#  Correr DENTRO del contenedor de la base (no necesita red):
#
#      sh /db/medir-buscador.sh
#
#  Desde la terminal de ZimaOS, con sudo:
#      sudo docker exec jsdr-db sh /db/medir-buscador.sh
#
#  Es seguro: trabaja sobre la COPIA, no sobre producción. Mide, crea los
#  índices de indices.sql y vuelve a medir. Tarda unos minutos.
#-----------------------------------------------------------------------------
set -e

PSQL="psql -U ${PGUSER:-jsdr} -d ${PGDATABASE:-jsdr_copia} -X -q -t -A"

echo "============================================================"
echo " jSDR — índices del buscador"
echo "============================================================"
echo

# --- 0. Estadísticas ---------------------------------------------------------
# pg_restore --data-only NO actualiza las estadísticas del planificador. Sin
# ellas Postgres planifica a ciegas y cualquier medición miente.
echo "[0/3] Actualizando estadísticas (ANALYZE)…"
SIN=$($PSQL -c "SELECT count(*) FROM pg_stat_user_tables WHERE last_analyze IS NULL AND last_autoanalyze IS NULL")
echo "      tablas sin analizar antes: $SIN"
$PSQL -c "ANALYZE" > /dev/null
echo "      listo"
echo

SECCION=$($PSQL -c "SELECT id_seccion FROM versiones WHERE eliminada = false GROUP BY id_seccion ORDER BY count(*) DESC LIMIT 1")
REDACTOR=$($PSQL -c "SELECT redactor FROM versiones WHERE eliminada = false GROUP BY redactor ORDER BY count(*) DESC LIMIT 1")
ESTADO=$($PSQL -c "SELECT estado FROM versiones WHERE eliminada = false GROUP BY estado ORDER BY count(*) DESC LIMIT 1")

echo "Valores tomados de la propia base:  sección $SECCION · redactor $REDACTOR · estado $ESTADO"
echo

# --- el medidor --------------------------------------------------------------
SALIDA=/tmp/jsdr-medicion
: > "$SALIDA.antes"; : > "$SALIDA.despues"

medir() {
  nombre="$1"; consulta="$2"
  # Dos corridas: la primera llena la caché y no representa el uso normal.
  $PSQL -c "EXPLAIN (ANALYZE) $consulta" > /dev/null 2>&1 || {
    echo "$nombre|ERROR" >> "$SALIDA.$FASE"; echo "  $nombre: ERROR"; return; }
  ms=$($PSQL -c "EXPLAIN (ANALYZE) $consulta" 2>/dev/null \
       | grep 'Execution Time' | sed 's/.*: //; s/ ms//')
  echo "$nombre|$ms" >> "$SALIDA.$FASE"
  printf '  %-40s %10s ms\n' "$nombre" "$ms"
}

# Exactamente lo que emite la API: mismo join por versión activa, misma regla
# de confidencialidad, mismo ORDER BY con los nulos donde van.
BASE="FROM versiones v
      JOIN noticias  n ON n.id = v.id_noticia AND v.numero = n.numero_version_activa
      JOIN secciones s ON s.id = v.id_seccion
     WHERE v.eliminada = false AND (v.confidencial IS NOT TRUE OR v.redactor = '$REDACTOR')"
COLS="n.guia, v.id_noticia, v.numero, v.fecha_publicacion, v.titulo, v.estado, v.redactor, s.codigo"
ORD="ORDER BY v.fecha_publicacion DESC NULLS LAST, v.id_noticia DESC LIMIT 31"

corrida() {
  echo "  --- la página de 30 que ve el usuario ---"
  medir "primera pantalla"          "SELECT $COLS $BASE $ORD"
  medir "filtrada por sección"      "SELECT $COLS $BASE AND v.id_seccion = $SECCION $ORD"
  medir "filtrada por estado"       "SELECT $COLS $BASE AND v.estado = '$ESTADO' $ORD"
  medir "filtrada por redactor"     "SELECT $COLS $BASE AND v.redactor = '$REDACTOR' $ORD"
  medir "texto que no existe"       "SELECT $COLS $BASE AND v.titulo ILIKE '%zzzznoexiste%' $ORD"
  echo "  --- ordenando por otras columnas ---"
  medir "ordenar por estado"        "SELECT $COLS $BASE ORDER BY v.estado DESC NULLS LAST, v.fecha_publicacion DESC NULLS LAST, v.id_noticia DESC LIMIT 31"
  medir "ordenar por redactor"      "SELECT $COLS $BASE ORDER BY v.redactor DESC NULLS LAST, v.fecha_publicacion DESC NULLS LAST, v.id_noticia DESC LIMIT 31"
  medir "ordenar por guía"          "SELECT $COLS $BASE ORDER BY n.guia DESC NULLS LAST, v.fecha_publicacion DESC NULLS LAST, v.id_noticia DESC LIMIT 31"
  echo "  --- el conteo ---"
  medir "count exacto (el viejo)"   "SELECT count(*) $BASE"
  medir "count acotado (el nuevo)"  "SELECT count(*) FROM (SELECT 1 $BASE LIMIT 1001) t"
}

FASE=antes
echo "[1/3] ANTES"
echo
corrida
echo

echo "[2/3] Aplicando indices.sql (varios minutos, ~380 MB)…"
psql -U "${PGUSER:-jsdr}" -d "${PGDATABASE:-jsdr_copia}" -X -q -f /db/indices.sql
echo "      listo"
echo

FASE=despues
echo "[3/3] DESPUÉS"
echo
corrida
echo

# --- comparación -------------------------------------------------------------
echo "============================================================"
echo " RESUMEN"
echo "============================================================"
printf '  %10s %10s %8s   %s\n' "antes" "después" "mejora" "consulta"
printf '  %10s %10s %8s   %s\n' "----------" "----------" "--------" "--------"
awk -F'|' '
  NR==FNR { antes[$1]=$2; next }
  {
    a = antes[$1]; d = $2;
    if (a ~ /^[0-9.]+$/ && d ~ /^[0-9.]+$/ && d > 0)
      printf "  %9.1f %9.1f %7.1fx   %s\n", a, d, a/d, $1;
    else
      printf "  %9s %9s %8s   %s\n", a, d, "-", $1;
  }' "$SALIDA.antes" "$SALIDA.despues"
echo
echo "  Lo que decide es la columna «después»: por debajo de 200 ms una"
echo "  búsqueda se siente instantánea."
echo
echo "  «ordenar por sección» no está en la lista porque ningún índice lo"
echo "  arregla: el orden es por el nombre de la sección, que vive en otra"
echo "  tabla. Filtrar por sección sí es instantáneo, y es lo que se usa."
echo

echo "============================================================"
echo " Índices creados"
$PSQL -c "
SELECT '  ' || indexrelname || ' -> ' || pg_size_pretty(pg_relation_size(indexrelid))
  FROM pg_stat_user_indexes WHERE indexrelname LIKE 'ix_%'
 ORDER BY pg_relation_size(indexrelid) DESC"
$PSQL -c "
SELECT '  TOTAL: ' || pg_size_pretty(sum(pg_relation_size(indexrelid)))
  FROM pg_stat_user_indexes WHERE indexrelname LIKE 'ix_%'"
echo
echo " Para volver atrás: DROP INDEX de los que figuran arriba."
echo "============================================================"
