archivo="f${1}.sal"
cat font00 | awk -f conver1.awk -v archivo=${archivo} > font${1}.nue
