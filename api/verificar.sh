#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# Suite de humo de la API. Corre contra la base con datos de prueba
# (db/datos-prueba.sql), no contra la copia de producción.
#
#   API=localhost:3099 ./api/verificar.sh
#
# Desde que hay login, la identidad sale del token y ya no de un parámetro de
# la URL: la suite entra como cada usuario y usa su token.
#-----------------------------------------------------------------------------
B="${API:-localhost:3099}"
ok=0; fail=0

# --- entrar ------------------------------------------------------------------
entrar() {
  curl -sS -m 10 -X POST "$B/api/sesion" \
    -H 'content-type: application/json' \
    -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
  | python3 -c "import sys,json
try: print(json.load(sys.stdin).get('token',''))
except Exception: print('')"
}

T_M=$(entrar mgomez 1234)
T_J=$(entrar jperez 1234)

if [ -z "$T_M" ] || [ -z "$T_J" ]; then
  echo "No se pudo entrar con los usuarios de prueba. ¿Está cargado datos-prueba.sql?"
  exit 1
fi

# t <nombre> <token> <ruta> <python>
t() {
  local out
  out=$(curl -sS -m 10 -H "authorization: Bearer $2" "$B$3" 2>/dev/null \
        | python3 -c "$4" 2>&1)
  if [ "$out" = "PASS" ]; then ok=$((ok+1)); printf "  ok    %s\n" "$1"
  else fail=$((fail+1)); printf "  FALLA %s -> %s\n" "$1" "$out"; fi
}

# c <nombre> <descripción> <código esperado> <curl args...>
c() {
  local nombre="$1" esperado="$2"; shift 2
  local codigo; codigo=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null)
  if [ "$codigo" = "$esperado" ]; then ok=$((ok+1)); printf "  ok    %s\n" "$nombre"
  else fail=$((fail+1)); printf "  FALLA %s -> %s (esperaba %s)\n" "$nombre" "$codigo" "$esperado"; fi
}

echo "Datos esperados: 4 noticias — 100 (3 versiones), 101 confidencial de mgomez,"
echo "102 eliminada, 103 normal. Visibles: mgomez 3 · jperez 2."
echo

echo "sesión"
c "sin token no se entra"                401 "$B/api/noticias"
c "token con firma falsa se rechaza"     401 -H "authorization: Bearer eyJ1IjoibWdvbWV6In0.falsa" "$B/api/noticias"
c "contraseña incorrecta"                401 -X POST "$B/api/sesion" -H 'content-type: application/json' -d '{"username":"mgomez","password":"mal"}'
c "usuario inexistente"                  401 -X POST "$B/api/sesion" -H 'content-type: application/json' -d '{"username":"nadie","password":"x"}'
c "usuario deshabilitado no entra"       401 -X POST "$B/api/sesion" -H 'content-type: application/json' -d '{"username":"baja","password":"1234"}'
t "la sesión trae usuario y secciones" "$T_M" "/api/sesion" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['usuario']['username']=='mgomez' and 'password' not in d['usuario'] and len(d['secciones'])>0 else d)"

echo "confidencialidad"
t "mgomez ve su confidencial" "$T_M" "/api/noticias" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==3 and any(n['version']['confidencial'] for n in d['items']) else d['total'])"
t "jperez NO ve la confidencial de mgomez" "$T_J" "/api/noticias" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==2 else 'FUGA')"
t "confidencial de otro da 404" "$T_J" "/api/noticias/101" \
  "import sys,json;print('PASS' if json.load(sys.stdin).get('error') else 'expuesta')"
t "el dueño sí la abre" "$T_M" "/api/noticias/101" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['id']==101 else 'mal')"
c "el export tampoco la filtra"          404 -H "authorization: Bearer $T_J" "$B/api/noticias/101/versiones/1/texto"

echo "buscador"
t "excluye versiones eliminadas" "$T_M" "/api/noticias?secciones=5" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==0 else 'aparece')"
t "version activa = v3, con las 3 versiones" "$T_M" "/api/noticias/100" \
  "import sys,json;n=json.load(sys.stdin);print('PASS' if n['version']['numero']==3 and len(n['versiones'])==3 else 'mal')"
t "medidas por campo en la version" "$T_M" "/api/noticias/100" \
  "import sys,json;m=json.load(sys.stdin)['version']['medidas'];print('PASS' if m['titulo']['cm']==3.5 and m['cuerpo']['cm'] is None else m)"
t "filtro seccion + estado" "$T_M" "/api/noticias?secciones=1&estado=FOTOCOMPUESTA" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==1 else 'mal')"
t "filtro por rango de fechas" "$T_M" "/api/noticias?desde=2026-09-18" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==1 and d['items'][0]['id']==103 else d['total'])"
t "filtro por guia parcial" "$T_M" "/api/noticias?guia=paro" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==1 else 'mal')"
t "paginado con total real" "$T_M" "/api/noticias?limite=1" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==3 and len(d['items'])==1 else 'mal')"
t "hay_mas cuando falta página" "$T_M" "/api/noticias?limite=1" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['hay_mas'] is True and d['total_exacto'] is True else d)"
t "hay_mas falso en la última" "$T_M" "/api/noticias?limite=1&offset=2" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['hay_mas'] is False else d)"
t "no devuelve la fila de sondeo" "$T_M" "/api/noticias?limite=2" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if len(d['items'])==2 else len(d['items']))"
t "orden invalido da 400" "$T_M" "/api/noticias?orden=xx" \
  "import sys,json;print('PASS' if 'validos' in json.load(sys.stdin) else 'no valida')"

echo "cables"
t "orden cables fecha+hora DESC" "$T_M" "/api/cables" \
  "import sys,json;i=[c['numero'] for c in json.load(sys.stdin)['items']];print('PASS' if i==[1202,1201,1203] else i)"
t "orden cables ASC" "$T_M" "/api/cables?asc=true" \
  "import sys,json;i=[c['numero'] for c in json.load(sys.stdin)['items']];print('PASS' if i==[1203,1201,1202] else i)"
t "leido/reservado segun el usuario" "$T_M" "/api/cables" \
  "import sys,json;i={c['numero']:c for c in json.load(sys.stdin)['items']};print('PASS' if i[1201]['leido'] and not i[1203]['leido'] and i[1202]['reservado_por']=='mgomez' else 'mal')"

echo "catálogos y eliminadas"
t "usuarios sin password" "$T_M" "/api/usuarios" \
  "import sys,json;u=json.load(sys.stdin);print('PASS' if u and all('password' not in x for x in u) else 'FILTRA PASSWORD')"
t "usuarios habilitados por defecto" "$T_M" "/api/usuarios" \
  "import sys,json;print('PASS' if len(json.load(sys.stdin))==3 else 'mal')"
t "versiones eliminadas propias" "$T_M" "/api/mis-versiones-eliminadas" \
  "import sys,json;v=json.load(sys.stdin);print('PASS' if len(v)==1 and v[0]['fecha_eliminacion']=='2026-09-11' else v)"
t "cada uno ve sólo las suyas" "$T_J" "/api/mis-versiones-eliminadas" \
  "import sys,json;print('PASS' if len(json.load(sys.stdin))==0 else 'FUGA')"

echo "exports"
t "CSV con BOM, cabecera y 3 filas" "$T_M" "/api/noticias.csv" \
  "import sys;s=sys.stdin.read();l=[x for x in s.replace(chr(13),'').split(chr(10)) if x];print('PASS' if s.startswith('﻿') and l[0].endswith('lineas') and len(l)==4 else repr(s[:70]))"
t "el CSV respeta la confidencialidad" "$T_J" "/api/noticias.csv" \
  "import sys;s=sys.stdin.read();print('PASS' if 'Nota confidencial' not in s else 'FUGA')"
c "CSV de cables responde"               200 -H "authorization: Bearer $T_M" "$B/api/cables.csv"
c "texto de una versión"                 200 -H "authorization: Bearer $T_M" "$B/api/noticias/100/versiones/2/texto"
# Ojo: la ruta va por id (500..502), no por `numero` (1201..1203). Son distintos.
c "texto de un cable"                    200 -H "authorization: Bearer $T_M" "$B/api/cables/500/texto"
c "cable inexistente da 404"             404 -H "authorization: Bearer $T_M" "$B/api/cables/999999/texto"

echo "  ---------------------------------"
printf "  %d pasan, %d fallan\n" $ok $fail
[ $fail -eq 0 ]
