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

/home/jsdr/bin/medir -f ${archivo} 
