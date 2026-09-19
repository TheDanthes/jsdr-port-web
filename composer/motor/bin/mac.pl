#!/usr/bin/perl 
use Env;                        # Para importar variables de entorno como PATH

# Toma variables del entorno
#$id
#$nombre
#$seccion
#$fecha
Env::import();

$[ = 1;			# set array base to 1
$, = "";		# set output field separator
$\ = "\015";		# set output record separator

$input="";
$output="";
#$end_line="\015";

print $id . "-" . $nombre . "-" . $seccion . "-" . $fecha;

line: while (<>) {
    chomp;	# strip record separator
    $input = $input . $_ . "\n";
    }
#Pasar materiales a indesign
$output=$input;
$output =~ s/\@Normal:\@Normal:/\@Normal:/g;
$output =~ s/^\@Normal://g;
$output =~ s/\@Normal:/\n/g;
$output=~ s/<\\b>/\n/g;

#open(prueba.out, ">/tmp/prueba.xtg");
#    print {prueba.out} $output;
#close (prueba.out);
if ( $seccion eq "si" ) { $seccion = "SE"};
$dir_ind="secretaria"; # default
SWITCH : {
	if ( $seccion eq "IG") {$dir_ind="ciudad"};
	if ( $seccion eq "CI") {$dir_ind="escenario"};
	if ( $seccion eq "DE") {$dir_ind="deportes"};
	if ( $seccion eq "EC") {$dir_ind="economia"};
	if ( $seccion eq "EP") {$dir_ind="educacion"};
	if ( $seccion eq "LI") {$dir_ind="seniales"};
	if ( $seccion eq "EX") {$dir_ind="mundo"};
	if ( $seccion eq "HI") {$dir_ind="hipica"};
	if ( $seccion eq "PA") {$dir_ind="infgeneral"};
	if ( $seccion eq "LR") {$dir_ind="region"};
	if ( $seccion eq "PO") {$dir_ind="policiales"};
	if ( $seccion eq "PL") {$dir_ind="politica"};
	if ( $seccion eq "SE") {$dir_ind="secretaria"};
	if ( $seccion eq "CL") {$dir_ind="secretaria"}; # cartas
	if ( $seccion eq "PE") {$dir_ind="suplementos"};
	if ( $seccion eq "FU") {$dir_ind="fundacion"};
	if ( $seccion eq "TU") {$dir_ind="suplementos"}; # Turismo
	if ( $seccion eq "SA") {$dir_ind="suplementos"}; # Salud
	if ( $seccion eq "MU") {$dir_ind="suplementos"}; # Mujer
	if ( $seccion eq "ES") {$dir_ind="suplementos"}; # estilo
}
$filesal="/u/indesign/" . $dir_ind . "/" . $nombre . ".txt"; 
open(indesign.out, "| /home/jsdr/bin/xtg2ind.pl >$filesal");
    print {indesign.out} $output;
close (indesign.out);

chmod 0666, $filesal;

