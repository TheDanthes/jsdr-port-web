#!/bin/sh
SDR_ROOT=/home/jsdr
SDR_EXCEP_PPAL=${SDR_ROOT}/excepciones/
SDR_FONTS=${SDR_ROOT}/fonts/
SDR_TMP=/tmp/
SDR_UFRM=${SDR_ROOT}/formatos/
SDR_FUENT_PPAL=${SDR_FONTS}
SDR_ESTIL_PPAL=${SDR_ROOT}/estilos/
export SDR_ROOT SDR_EXCEP_PPAL SDR_FONTS SDR_TMP SDR_UFRM SDR_FUENT_PPAL SDR_ESTIL_PPAL
archivo=$1  ## path completo archivo
guia=$2     ## Nombre del material que deja en la carpeta destino
seccion=$3  ## Codigo de seccion (CI = escenario, etc)
xtg=`echo ${archivo} | cut -f1 -d"."`.xtg

/home/jsdr/bin/sr2xp ${archivo} #2>/dev/null 
lp -s -d MAC_NUE -t"${archivo} ${guia} ${seccion}" ${xtg}
