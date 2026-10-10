#!/usr/bin/env bash
#-----------------------------------------------------------------------------
# Suite de humo del EDITOR (Fase 3).
#
#   API=192.168.3.100:3099 USUARIO=xxx CLAVE=yyy ./api/verificar-editor.sh
#
# Necesita la API con JSDR_EDICION=si y el composer levantado. Entra como
# USUARIO (tiene que poder redactar en alguna sección), crea una noticia de
# prueba, la mide, la guarda, prueba que las validaciones rechacen lo que
# tienen que rechazar, y al final la DESCARTA: no deja nada en la base.
#
# No fotocompone: eso escribe un .txt en la carpeta de InDesign.
#-----------------------------------------------------------------------------
B="${API:-localhost:3099}"
U="${USUARIO:-mgomez}"
P="${CLAVE:-1234}"
ok=0; fail=0

j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

# Una sola sesión por usuario: si ya está conectado en otro equipo, la API
# pregunta (409). Con FORZAR=si la suite cierra esa sesión y sigue.
FZ=""; [ "${FORZAR:-}" = "si" ] && FZ=',"forzar":true'
R0=$(curl -sS -m 10 -X POST "$B/api/sesion" -H 'content-type: application/json' \
      -d "{\"username\":\"$U\",\"password\":\"$P\"$FZ}")
T=$(echo "$R0" | j "d.get('token','')" 2>/dev/null)
[ -z "$T" ] && { echo "No se pudo entrar como $U: $R0"; echo "(Si ya está logueado: cerrá esa sesión o corré con FORZAR=si.)"; exit 1; }
H="authorization: Bearer $T"; J='content-type: application/json'
trap 'curl -sS -m 5 -o /dev/null -X DELETE "$B/api/sesion" -H "$H"' EXIT

si() { if [ "$2" = "PASS" ]; then ok=$((ok+1)); printf "  ok    %s\n" "$1"; else fail=$((fail+1)); printf "  FALLA %s -> %s\n" "$1" "$2"; fi; }

echo "editor en $B, como $U"
ED=$(curl -sS -m 10 "$B/api/sesion" -H "$H" | j "d.get('edicion')")
si "la API tiene la edición habilitada" "$([ "$ED" = "True" ] && echo PASS || echo "edicion=$ED")"

R=$(curl -sS -m 10 -X POST "$B/api/editor/nueva" -H "$H")
ID=$(echo "$R" | j "d['noticia']['id']" 2>/dev/null)
SEC=$(echo "$R" | j "d['noticia']['seccion_id']" 2>/dev/null)
FECHA=$(echo "$R" | j "d['noticia']['fecha']" 2>/dev/null)
si "crear una noticia" "$([ -n "$ID" ] && echo PASS || echo "$R")"
[ -z "$ID" ] && { echo "  $fail fallan"; exit 1; }

M=$(curl -sS -m 20 -X POST "$B/api/editor/medir" -H "$H" -H "$J" \
     -d '{"titular":"Prueba del editor web╠","cuerpo":"Texto de prueba con “comillas”.╠"}')
si "medir (F3) contra el motor" "$(echo "$M" | j "'PASS' if d['noticia']['cm']>0 and d['noticia']['lineas']>0 else d" 2>&1)"

DATOS() { echo "{\"guia_usuario\":\"$1\",\"seccion_id\":$SEC,\"fecha\":\"$2\",\"confidencial\":false,\"titular\":\"Prueba del editor web╠\",\"cuerpo\":\"Texto de prueba.╠\",\"medidas\":{\"titular\":{\"cm\":0.5,\"lineas\":1},\"cuerpo\":{\"cm\":0.5,\"lineas\":1},\"noticia\":{\"cm\":1,\"lineas\":2}}}"; }

C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X PUT "$B/api/editor/$ID/1" -H "$H" -H "$J" -d "$(DATOS '' "$FECHA")")
si "guardar sin guía se rechaza (422)" "$([ "$C" = 422 ] && echo PASS || echo "$C")"
C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X PUT "$B/api/editor/$ID/1" -H "$H" -H "$J" -d "$(DATOS prueba_web 2000-01-01)")
si "guardar con fecha pasada se rechaza (422)" "$([ "$C" = 422 ] && echo PASS || echo "$C")"
C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X PUT "$B/api/editor/$ID/1" -H "$H" -H "$J" -d "$(DATOS 'con espacio' "$FECHA")")
si "guía inválida se rechaza (400)" "$([ "$C" = 400 ] && echo PASS || echo "$C")"
G=$(curl -sS -m 10 -X PUT "$B/api/editor/$ID/1" -H "$H" -H "$J" -d "$(DATOS prueba_web "$FECHA")")
si "guardar" "$(echo "$G" | j "'PASS' if d.get('guia','').startswith('prueba_web-') else d" 2>&1)"
A=$(curl -sS -m 10 -X PUT "$B/api/editor/$ID/1/temporal" -H "$H" -H "$J" -d "$(DATOS prueba_web "$FECHA")")
si "autoguardar" "$(echo "$A" | j "'PASS' if d.get('ok') else d" 2>&1)"

C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -X POST "$B/api/editor/$ID/abrir" -H "$H")
si "abrirla de nuevo mientras está abierta: 409 EN_EDICION" "$([ "$C" = 409 ] && echo PASS || echo "$C")"

X=$(curl -sS -m 10 -X POST "$B/api/editor/$ID/1/cerrar" -H "$H" -H "$J" -d '{"accion":"descartar_creacion"}')
si "descartarla (no queda nada en la base)" "$(echo "$X" | j "'PASS' if d.get('borrada') else d" 2>&1)"
C=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$B/api/noticias/$ID" -H "$H")
si "ya no existe" "$([ "$C" = 404 ] && echo PASS || echo "$C")"

echo "  ---------------------------------"
echo "  $ok pasan, $fail fallan"
[ "$fail" -eq 0 ]
