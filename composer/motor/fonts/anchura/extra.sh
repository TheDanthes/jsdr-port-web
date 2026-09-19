echo "cortar todo el .ps desde el comienzo 
hasta la posicion del  caracter 32 inclusive"
read papa
emacs f${1}.ps
emacs f${1}.ps
cat f${1}.ps | awk -f extraer.awk > f${1}
archivo="f${1}.sal"
cat f${1} | awk -f calculin.awk > ${archivo}
cat font00 | awk -f conver1.awk -v archivo=${archivo} > font${1}.nue
