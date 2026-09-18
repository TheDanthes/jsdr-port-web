#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# jSDR — Restaurar la copia de producción en el PostgreSQL 16 local
#
# No toca el servidor de producción: trabaja sobre el archivo de dump.
#
#   ./db/restaurar-copia.sh ./dumps/jsdr-completo.dump
#-----------------------------------------------------------------------------
set -euo pipefail

DUMP="${1:-./dumps/jsdr-completo.dump}"
SVC=db
DB=jsdr_copia
U=jsdr

if [ ! -f "$DUMP" ]; then
    echo "No encuentro el dump: $DUMP" >&2
    echo "Copialo a ./dumps/ o pasá la ruta como primer argumento." >&2
    exit 1
fi

# El dump está montado dentro del contenedor bajo /dumps
DUMP_IN="/dumps/$(basename "$DUMP")"

run() { docker compose exec -T $SVC "$@"; }

echo "==> Esperando a que la base esté lista..."
docker compose up -d $SVC
until run pg_isready -U $U -d $DB > /dev/null 2>&1; do sleep 1; done

echo
echo "==> [1/5] Verificando que pg_restore 16 pueda leer un dump de PostgreSQL 8.0.3"
if run pg_restore -l "$DUMP_IN" > /dev/null 2>&1; then
    echo "    OK, el archivo es legible"
else
    echo "    NO LEGIBLE."
    echo
    echo "    pg_restore 16 no puede abrir este archivo custom de 8.0.3."
    echo "    Plan B: pedir al servidor viejo un dump en SQL plano:"
    echo
    echo "      pg_dump -U jsdr -Fp --data-only jsdr | gzip > jsdr-datos.sql.gz"
    echo
    echo "    y después:  gunzip -c jsdr-datos.sql.gz | docker compose exec -T db psql -U jsdr -d $DB"
    exit 1
fi

echo
echo "==> [2/5] Recreando la base (se descarta cualquier copia anterior)"
run psql -U $U -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" > /dev/null
run psql -U $U -d postgres -c "CREATE DATABASE $DB ENCODING 'UTF8'" > /dev/null

echo "==> [3/5] Aplicando el esquema modernizado"
run psql -U $U -d $DB -v ON_ERROR_STOP=1 -q -f /db/esquema-moderno.sql
echo "    17 tablas creadas"

echo
echo "==> [4/5] Restaurando los datos (1,4 GB — esto tarda varios minutos)"
run pg_restore --data-only --no-owner --disable-triggers \
    -U $U -d $DB -j 2 "$DUMP_IN" 2>&1 | grep -v "^$" | tail -5 || true

echo
echo "==> [5/5] Reajustando las secuencias"
run psql -U $U -d $DB -q <<'SQL'
SELECT setval('noticias_id_seq',  COALESCE((SELECT max(id) FROM noticias),  1));
SELECT setval('usuarios_id_seq',  COALESCE((SELECT max(id) FROM usuarios),  1));
SELECT setval('secciones_id_seq', COALESCE((SELECT max(id) FROM secciones), 1));
SELECT setval('permisos_id_seq',  COALESCE((SELECT max(id) FROM permisos),  1));
SELECT setval('agencias_id_seq',  COALESCE((SELECT max(id) FROM agencias),  1));
SELECT setval('cables_id_seq',    COALESCE((SELECT max(id) FROM cables),    1));
SELECT setval('comandos_id_seq',  COALESCE((SELECT max(id) FROM comandos),  1));
SELECT setval('usos_id_seq',      COALESCE((SELECT max(id) FROM usos),      1));
SELECT setval('notas_id_seq',     COALESCE((SELECT max(id) FROM notas),     1));
SQL

echo
echo "==> Control: filas restauradas contra lo que había en producción el 2026-09-18"
run psql -U $U -d $DB -c "
SELECT t.tabla, t.esperado, c.real,
       CASE WHEN c.real = t.esperado THEN 'ok' ELSE 'REVISAR' END AS estado
FROM (VALUES
        ('versiones',    1297497),
        ('noticias',     1093772),
        ('diccionario',   378948),
        ('usos',             297),
        ('comandos',         255),
        ('usuarios',         170),
        ('secciones',         26),
        ('agencias',          14),
        ('permisos',           9)
     ) AS t(tabla, esperado)
JOIN (SELECT 'versiones' AS tabla, count(*) AS real FROM versiones
      UNION ALL SELECT 'noticias',    count(*) FROM noticias
      UNION ALL SELECT 'diccionario', count(*) FROM diccionario
      UNION ALL SELECT 'usos',        count(*) FROM usos
      UNION ALL SELECT 'comandos',    count(*) FROM comandos
      UNION ALL SELECT 'usuarios',    count(*) FROM usuarios
      UNION ALL SELECT 'secciones',   count(*) FROM secciones
      UNION ALL SELECT 'agencias',    count(*) FROM agencias
      UNION ALL SELECT 'permisos',    count(*) FROM permisos
     ) AS c USING (tabla)
ORDER BY t.esperado DESC"

echo
echo "LISTO. Conexión:  postgresql://jsdr@127.0.0.1:55432/jsdr_copia"
echo
echo "Las diferencias en 'versiones' y 'noticias' son esperables: el dump se tomó"
echo "el 18-sep y el sistema sigue produciendo. Un desvío grande sí hay que mirarlo."
