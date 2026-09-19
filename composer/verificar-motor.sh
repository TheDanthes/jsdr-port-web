#!/bin/sh
#-----------------------------------------------------------------------------
#  jSDR — Banco de pruebas del motor tipográfico
#
#  Corre el motor containerizado contra casos REALES de producción y exige que
#  la salida sea idéntica BYTE A BYTE a la que guardó el sistema viejo.
#
#      medir     139 casos x 3 salidas  (.out medida, .err errores, .frm texto)
#      sr2xp      58 casos x 1 salida   (.xtg XPress Tags)
#      InDesign   58 casos              (cadena Perl original vs. la nueva)
#      cuelgue     1 caso               (que el motor siga colgándose)
#                                       ----
#                                       534 comparaciones
#
#  Los casos salieron del servidor de producción: `Server JSDR/medir/` y
#  `Server JSDR/fotocomponer/`. No son casos inventados — son noticias que se
#  publicaron, con la medida que el motor les dio ese día.
#
#  POR QUÉ BYTE A BYTE Y NO "PARECIDO"
#  La medida decide cuánto entra en la página. Un decimal de diferencia en un
#  título de tapa es una nota que no cierra. Y el `.xtg` es el contrato con
#  InDesign: cualquier diferencia la descubre el diagramador a las 23:00.
#
#  LAS RUTAS ABSOLUTAS SON A PROPÓSITO
#  `medir` escribe en su salida la ruta del archivo que midió:
#
#      /usr/local/jSDR/medir/amedir/jsdr37550.medir(539): Atencion: La longitud…
#
#  Así que el banco copia cada caso a ESA ruta exacta antes de medirlo. De otro
#  modo habría que normalizar la salida antes de compararla, y normalizar es
#  justamente la puerta por la que se cuela una diferencia real.
#
#  Uso:   sh verificar-motor.sh            todos los casos
#         sh verificar-motor.sh -v         además, el diff de cada falla
#-----------------------------------------------------------------------------

VERBOSE=0
[ "$1" = "-v" ] && VERBOSE=1

AQUI=$(cd "$(dirname "$0")" && pwd)
: "${SDR_ROOT:=$AQUI/motor}"
export SDR_ROOT
. "$AQUI/entorno.sh"

BIN="$SDR_ROOT/bin"
PRUEBAS="${JSDR_PRUEBAS:-$AQUI/pruebas}"

# La ruta que el sistema viejo usaba, reproducida acá.
AMEDIR=/usr/local/jSDR/medir/amedir

# OJO con el nombre de esta carpeta: NO puede contener un punto.
# `sr2xp` arma el nombre del .xtg cortando la ruta de entrada en el PRIMER
# punto —  `echo ${archivo} | cut -f1 -d"."`, tal cual en fotocomponer.sh — así
# que con un directorio tipo /tmp/tmp.AbC123 el resultado sale escrito en
# /tmp/tmp.xtg y los 58 casos "no generan" nada. Perdido un rato en eso.
# El servicio HTTP de la Fase 2 tiene la misma restricción.
TRABAJO=/tmp/jsdr-verificar-$$
mkdir -p "$TRABAJO"
mkdir -p "$AMEDIR" 2>/dev/null || {
  echo "No se pudo crear $AMEDIR (hace falta permiso de escritura o correr como root)."
  exit 2
}

ok=0; mal=0; FALLAS=$TRABAJO/fallas
: > "$FALLAS"

# comparar <etiqueta> <esperado> <obtenido>
comparar() {
  if [ ! -f "$3" ]; then
    echo "$1|no se generó" >> "$FALLAS"; mal=$((mal+1)); return
  fi
  if cmp -s "$2" "$3"; then
    ok=$((ok+1))
  else
    echo "$1|difiere" >> "$FALLAS"; mal=$((mal+1))
    if [ "$VERBOSE" = 1 ]; then
      echo "  --- $1"
      diff "$2" "$3" | head -6 | sed 's/^/      /'
    fi
  fi
}

echo "============================================================"
echo " jSDR — motor tipográfico contra los casos de producción"
echo "============================================================"
echo " motor:   $SDR_ROOT"
echo " casos:   $PRUEBAS"
echo " arq:     $(uname -m)"
echo

# --- medir -------------------------------------------------------------------
# Tres salidas por caso, y las tres importan:
#   .out  la medida en cm y didots  → es LA respuesta
#   .err  los errores tipográficos  → lo que el redactor ve en pantalla
#   .frm  el texto ya formateado    → lo que después come sr2xp
echo "[1/4] medir — 139 casos, 3 salidas cada uno"
n=0
for entrada in "$PRUEBAS"/medir/amedir/*.medir; do
  id=$(basename "$entrada" .medir)
  n=$((n+1))
  cp "$entrada" "$AMEDIR/$id.medir"
  rm -f "$AMEDIR/$id.frm"
  # El código de salida NO es señal de error: medir devuelve la cantidad de
  # avisos. Lo que se compara es la salida.
  "$BIN/medir" -f "$AMEDIR/$id.medir" > "$TRABAJO/$id.out" 2> "$TRABAJO/$id.err"
  comparar "medir/$id.out" "$PRUEBAS/medir/out/$id.out" "$TRABAJO/$id.out"
  comparar "medir/$id.err" "$PRUEBAS/medir/err/$id.err" "$TRABAJO/$id.err"
  comparar "medir/$id.frm" "$PRUEBAS/medir/amedir/$id.frm" "$AMEDIR/$id.frm"
done
echo "      $n casos corridos"
echo

# --- sr2xp -------------------------------------------------------------------
# Deja el .xtg al lado de la entrada, con el mismo nombre.
echo "[2/4] sr2xp — 58 casos, el .xtg que va a InDesign"
n=0
for entrada in "$PRUEBAS"/fotocomponer/*.sr2xp; do
  id=$(basename "$entrada" .sr2xp)
  n=$((n+1))
  cp "$entrada" "$TRABAJO/$id.sr2xp"
  rm -f "$TRABAJO/$id.xtg"
  ( cd "$TRABAJO" && "$BIN/sr2xp" "$TRABAJO/$id.sr2xp" > /dev/null 2>&1 )
  comparar "sr2xp/$id.xtg" "$PRUEBAS/fotocomponer/$id.xtg" "$TRABAJO/$id.xtg"
done
echo "      $n casos corridos"
echo

# --- cadena a InDesign -------------------------------------------------------
# El único eslabón reescrito es mac.pl (cuatro sustituciones y el mapa de
# secciones). `xtg2ind.pl` se sigue usando tal cual. Esto compara la cadena
# original contra la nueva sobre los mismos 58 .xtg.
if [ -x "$AQUI/dist/comparar-indesign.js" ] || [ -f "$AQUI/dist/comparar-indesign.js" ]; then
  echo "[3/4] cadena a InDesign — Perl original contra implementación nueva"
  if ! sh "$AQUI/pruebas/referencia-perl.sh" "$TRABAJO/referencia"; then
    # La referencia es la cadena vieja. Si no corre, no hay comparación
    # posible y decir "58 difieren" sería mentir: no difieren, no se midieron.
    mal=$((mal+58))
    echo "indesign|no se pudo generar la referencia en Perl" >> "$FALLAS"
  elif node "$AQUI/dist/comparar-indesign.js" "$TRABAJO/referencia" "$PRUEBAS/fotocomponer"; then
    ok=$((ok+58))
  else
    mal=$((mal+58)); echo "indesign|difiere" >> "$FALLAS"
  fi
  echo
else
  echo "[3/4] cadena a InDesign — omitida (falta compilar: npm ci && npm run build)"
  echo
fi

# --- el caso que cuelga ------------------------------------------------------
# `medir` entra en un bucle infinito con ciertas entradas. En el servidor de
# producción quedó guardado el archivo que lo colgaba, con ese nombre. Acá se
# comprueba que sigue colgando —es decir, que el caso es real y que el tope de
# tiempo del servicio no es una precaución inventada.
echo "[4/4] el caso que cuelga el motor"
if [ -f "$PRUEBAS/cuelga/cuelga.medir" ]; then
  cp "$PRUEBAS/cuelga/cuelga.medir" "$AMEDIR/cuelga.medir"
  if timeout 10 "$BIN/medir" -f "$AMEDIR/cuelga.medir" > /dev/null 2>&1; then
    echo "      ⚠️  terminó: el motor de este contenedor NO se cuelga con ese caso."
    echo "          Vale la pena mirar por qué antes de bajar el tope de tiempo."
  else
    echo "      confirmado: no termina, se lo corta por tiempo (es lo esperado)"
    ok=$((ok+1))
  fi
else
  echo "      (falta pruebas/cuelga/cuelga.medir)"
fi
echo

# --- veredicto ---------------------------------------------------------------
total=$((ok+mal))
echo "============================================================"
if [ "$mal" -eq 0 ]; then
  echo " ✅  $ok/$total idénticas byte a byte"
  echo
  echo " El motor containerizado mide y compone exactamente igual que el"
  echo " servidor de producción. La Fase 2 se puede seguir construyendo"
  echo " encima de esto."
else
  echo " ❌  $mal de $total salidas NO coinciden"
  echo
  # Se cuentan las líneas registradas, no `$mal`: una sola falla puede valer
  # por 58 comparaciones (el bloque de InDesign se cuenta entero), y decir
  # "y 18 más" cuando hay una sola línea confunde en lugar de ayudar.
  registradas=$(wc -l < "$FALLAS")
  sort "$FALLAS" | head -40 | awk -F'|' '{printf "   %-28s %s\n", $1, $2}'
  [ "$registradas" -gt 40 ] && echo "   … y $((registradas-40)) más"
  echo
  echo " Correr con -v para ver el diff de cada una."
  echo " NO seguir construyendo encima hasta que esto dé 0."
fi
echo "============================================================"

rm -rf "$TRABAJO"
[ "$mal" -eq 0 ]
