#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# Suite de humo de la API. Corre contra la base con datos de prueba
# (db/datos-prueba.sql), no contra la copia de producción.
#
#   API=localhost:3000 ./api/verificar.sh
#-----------------------------------------------------------------------------
B="${API:-localhost:3000}/api"
ok=0; fail=0

t() {
  local out; out=$(curl -sS -m 10 "$B$2" 2>/dev/null | python3 -c "$3" 2>&1)
  if [ "$out" = "PASS" ]; then ok=$((ok+1)); printf "  ok    %s\n" "$1"
  else fail=$((fail+1)); printf "  FALLA %s -> %s\n" "$1" "$out"; fi
}

echo "Datos esperados: 4 noticias — 100 (3 versiones), 101 confidencial de mgomez,"
echo "102 eliminada, 103 normal. Visibles: sin usuario 2 · como mgomez 3."
echo

t "oculta confidenciales sin usuario" "/noticias" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==2 and all(not n['version']['confidencial'] for n in d['items']) else d['total'])"
t "mgomez ve su confidencial" "/noticias?usuario=mgomez" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==3 and any(n['version']['confidencial'] for n in d['items']) else d['total'])"
t "jperez NO ve la confidencial de mgomez" "/noticias?usuario=jperez" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==2 else 'FUGA')"
t "excluye versiones eliminadas" "/noticias?secciones=5" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==0 else 'aparece')"
t "version activa = v3, con las 3 versiones" "/noticias/100" \
  "import sys,json;n=json.load(sys.stdin);print('PASS' if n['version']['numero']==3 and len(n['versiones'])==3 else 'mal')"
t "medidas por campo en la version" "/noticias/100" \
  "import sys,json;m=json.load(sys.stdin)['version']['medidas'];print('PASS' if m['titulo']['cm']==3.5 and m['cuerpo']['cm'] is None else m)"
t "confidencial de otro da 404" "/noticias/101" \
  "import sys,json;print('PASS' if json.load(sys.stdin).get('error') else 'expuesta')"
t "filtro seccion + estado" "/noticias?secciones=1&estado=FOTOCOMPUESTA" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==1 else 'mal')"
t "filtro por rango de fechas" "/noticias?desde=2026-09-18" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==1 and d['items'][0]['id']==103 else d['total'])"
t "filtro por guia parcial" "/noticias?guia=paro" \
  "import sys,json;print('PASS' if json.load(sys.stdin)['total']==1 else 'mal')"
t "orden cables fecha+hora DESC" "/cables" \
  "import sys,json;i=[c['numero'] for c in json.load(sys.stdin)['items']];print('PASS' if i==[1202,1201,1203] else i)"
t "orden cables ASC" "/cables?asc=true" \
  "import sys,json;i=[c['numero'] for c in json.load(sys.stdin)['items']];print('PASS' if i==[1203,1201,1202] else i)"
t "leido/reservado por usuario" "/cables?usuario=mgomez" \
  "import sys,json;i={c['numero']:c for c in json.load(sys.stdin)['items']};print('PASS' if i[1201]['leido'] and not i[1203]['leido'] and i[1202]['reservado_por']=='mgomez' else 'mal')"
t "paginado con total real" "/noticias?limite=1&usuario=mgomez" \
  "import sys,json;d=json.load(sys.stdin);print('PASS' if d['total']==3 and len(d['items'])==1 else 'mal')"
t "orden invalido da 400" "/noticias?orden=xx" \
  "import sys,json;print('PASS' if 'validos' in json.load(sys.stdin) else 'no valida')"
t "usuarios sin password" "/usuarios" \
  "import sys,json;u=json.load(sys.stdin);print('PASS' if u and all('password' not in x for x in u) else 'FILTRA PASSWORD')"
t "usuarios habilitados por defecto" "/usuarios" \
  "import sys,json;print('PASS' if len(json.load(sys.stdin))==3 else 'mal')"
t "versiones eliminadas recuperables" "/usuarios/mgomez/versiones-eliminadas" \
  "import sys,json;v=json.load(sys.stdin);print('PASS' if len(v)==1 and v[0]['fecha_eliminacion']=='2026-09-11' else v)"

echo "  ---------------------------------"
printf "  %d pasan, %d fallan\n" $ok $fail
[ $fail -eq 0 ]
