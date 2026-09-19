cat font-$1.txt | tr -d "\015" | awk '{ if ( NR >1 ) { print $2 }}' > font-$1.med
mv font-$1.med /home/jsdr/fonts/
/home/jsdr/bin/fonmaker $1
echo "lista font $1"

