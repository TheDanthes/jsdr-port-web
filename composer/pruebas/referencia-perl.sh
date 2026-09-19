#!/bin/sh
#-----------------------------------------------------------------------------
#  Genera la salida de REFERENCIA de la cadena original a InDesign.
#
#  Corre el `mac.pl` del servidor de producción, sin tocarlo, seguido del
#  `xtg2ind.pl` del servidor de producción, sin tocarlo, sobre los 58 `.xtg`
#  reales. Lo que sale de acá es contra lo que se compara la implementación
#  nueva.
#
#  LA ÚNICA LIBERTAD QUE SE TOMA, Y POR QUÉ
#  `mac.pl` empieza con `$[ = 1;` (base de los arrays en 1), que Perl eliminó
#  en la versión 5.30 y aborta el script en cualquier Perl moderno. `mac.pl`
#  **no usa un solo array** —se puede comprobar: no hay `@`, ni `split`, ni
#  índices—, así que esa línea es código muerto de 2005. El cargador de abajo
#  la saca en memoria y ejecuta el resto textual.
#
#  No se modifica el archivo en disco: se lee, se le quita esa línea y se
#  evalúa. El original queda como está.
#
#  Uso:  sh referencia-perl.sh <carpeta-destino>
#-----------------------------------------------------------------------------
set -e

DESTINO=${1:?falta la carpeta de destino}
AQUI=$(cd "$(dirname "$0")" && pwd)
MOTOR=${SDR_ROOT:-$AQUI/../motor}

# `xtg2ind.pl` abre /home/jsdr/bin/lista_fonts con la ruta escrita adentro, y
# `mac.pl` lo invoca por esa misma ruta absoluta. En vez de editar los scripts
# —que es justamente lo que no hay que hacer— se les da la ruta que esperan.
#
# Los .pl rescatados vienen con finales de línea CRLF, y con eso el shebang
# queda `#!/usr/bin/perl \r`: el kernel llama a perl con un argumento vacío y
# el script no arranca ("Can't open perl script"). En producción no puede ser
# así —el diario sale todos los días—, así que el CRLF entró en el rescate, al
# pasar los archivos por Windows. Se normaliza al copiarlos; el original en el
# repositorio queda tal cual se rescató.
rm -rf /home/jsdr/bin
mkdir -p /home/jsdr/bin
for f in "$MOTOR"/bin/*; do
  case "$f" in
    *.pl|*.sh) sed 's/\r$//' "$f" > "/home/jsdr/bin/$(basename "$f")" ;;
    *)         cp "$f" "/home/jsdr/bin/$(basename "$f")" ;;
  esac
done
chmod +x /home/jsdr/bin/*.pl /home/jsdr/bin/*.sh 2>/dev/null || true

# mac.pl escribe en /u/indesign/<carpeta>/<guia>.txt, hardcodeado.
for d in ciudad escenario deportes economia educacion seniales mundo hipica \
         infgeneral region policiales politica secretaria fundacion suplementos; do
  mkdir -p "/u/indesign/$d"
done

mkdir -p "$DESTINO"

for xtg in "$AQUI"/fotocomponer/*.xtg; do
  id=$(basename "$xtg" .xtg)
  # Sección fija: lo que se compara es la transformación del texto, no el mapa
  # de carpetas (ese está en secciones.json y se prueba aparte).
  nombre="$id" seccion=DE perl -e '
      my $ruta = shift;
      open my $f, "<", $ruta or die $!;
      my $codigo = do { local $/; <$f> };
      $codigo =~ s/^\s*\$\[\s*=\s*1;.*$//m;   # la única línea que se quita
      eval $codigo;
      die $@ if $@;
  ' /home/jsdr/bin/mac.pl < "$xtg" > /dev/null
  # El > /dev/null es por el `print $id . "-" . $nombre . ...` que mac.pl tiene
  # al principio: una traza de 2005 que no sirve para nada acá. Los errores
  # siguen yendo a stderr y se ven.
  mv "/u/indesign/deportes/$id.txt" "$DESTINO/$id.txt"
done

hechos=$(ls -1 "$DESTINO" | wc -l)
esperados=$(ls -1 "$AQUI"/fotocomponer/*.xtg | wc -l)
echo "referencia: $hechos de $esperados archivos en $DESTINO"

# Si la referencia sale incompleta, hay que enterarse ACÁ. Si no, el programa
# que compara falla más abajo con un "no such file or directory" que parece un
# problema de la implementación nueva cuando en realidad es que la vieja no
# llegó a correr. Pasó: en la imagen faltaba `Env.pm` —`mac.pl` hace
# `use Env;`— y el error real quedó tapado dos pantallas más arriba.
if [ "$hechos" -ne "$esperados" ]; then
  echo "  ^^^ la referencia en Perl NO se pudo generar completa."
  echo "      Sin ella no hay contra qué comparar: el bloque 3 no vale."
  exit 1
fi
