#!/usr/bin/perl

use DBI;
use POSIX;
use Env;                        # Para importar variables de entorno como PATH
Env::import();
my $dbh = DBI->connect('dbi:Pg:dbname=jsdr;host=localhost','jsdr','jsdr') || die 'no me pude conectar a la base';

my $query = "INSERT INTO usos (numero, descripcion, texto) VALUES (?,?,?)";

my $nro_formato = $formato;

############### MAIN ##################
$[ = 1;			# set array base to 1
$, = ' ';		# set output field separator
$\ = "\n";		# set output record separator

$cuerpo="";

line: while (<>) {
    chomp;	# strip record separator
    if ( $_ !~ /\235t/ ) {
            $s = "\\314"; 
            $_=~ s/$s/\314\x0a/g;
    }
    $cuerpo = $cuerpo . " " . $_;
}

# Conversion caracteres 
        # limpiar basuras
        $s = "\\262"; 
        $cuerpo=~ s/$s//g;
        # limpiar \n
        #$cuerpo=~ s/\x0a/ /g;
        #$s = "\\314 "; 
        #$cuerpo=~ s/$s/\314\x0a/g;
        $cuerpo=~ s/\x0a +/\x0a/g;
        ## fin tabulado + fin de linea
        $s = "\\301";
        $cuerpo=~ s/$s/\301\x0a/g;
        ## bell t + fin linea
        $s = "\\235t";
        $cuerpo=~ s/$s/\x0a\235t/g;
        # a acentuada
    	$s = "\\240";
        $cuerpo=~ s/$s/\341/g;
	# e acentuada
    	$s = "\\202";
        $cuerpo=~ s/$s/\351/g;
        # i acentuada
    	$s = "\\241";
        $cuerpo=~ s/$s/\355/g;
	# o acentuada
    	$s = "\\242";
        $cuerpo=~ s/$s/\363/g;
	# u acentuada
    	$s = "\\243";
        $cuerpo=~ s/$s/\372/g;
	# u dieresis 
    	$s = "\\201";
        $cuerpo=~ s/$s/\374/g;
	# enie minuscula
    	$s = "\\244";
        $cuerpo=~ s/$s/\361/g;
	# enie mayuscula
    	$s = "\\245";
        $cuerpo=~ s/$s/\321/g;
	# a acento frances
	$s = "\\205";
        $cuerpo=~ s/$s/\340/g;
	# e acento frances
	$s = "\\212";
        $cuerpo=~ s/$s/\350/g;
	# i acento frances
	$s = "\\215";
        $cuerpo=~ s/$s/\354/g;
	# o acento frances
	$s = "\\225";
        $cuerpo=~ s/$s/\362/g;
	# u acento frances
	$s = "\\227";
        $cuerpo=~ s/$s/\371/g;
	# medio cuadratin
        $s = "\\360", $nue=chr(9633); 
        $cuerpo=~ s/$s/$nue/g;
    	#$s = "\\343" # espacio fino
        # cuadratin
    	$s = "\\376", $nue=chr(9632);
        $cuerpo=~ s/$s/$nue/g;
	# signo interrogacion apertura
    	$s = "\\250";
        $cuerpo=~ s/$s/\277/g;
        # signo admiracion apertura
    	$s = "\\255";
        $cuerpo=~ s/$s/\241/g;
	# comillas francesas abrir
    	$s = "\\256";
        $cuerpo=~ s/$s/\253/g;
	# comillas francesas cerrar
    	$s = "\\257";
        $cuerpo=~ s/$s/\273/g;
	# a volada
    	$s = "\\246";
        $cuerpo=~ s/$s/\252/g;
	# o volada
    	$s = "\\247";
        $cuerpo=~ s/$s/\272/g;
	# c minuscula c/cedilla
    	$s = "\\207";
        $cuerpo=~ s/$s/\347/g;
	# c mayuscula c/cedilla
    	$s = "\\200";
        $cuerpo=~ s/$s/\307/g;
	#, s/$s/\042/g; # abrir doble comilla
        $s = "\\042", $nue=chr(8220);  
        $cuerpo=~ s/$s/$nue/g;
        # cerrar doble comilla
    	$s = "\\357", $nue=chr(8221); 
        $cuerpo=~ s/$s/$nue/g;
        # quad left
        $s = "\\314", $nue=chr(9568); 
        $cuerpo=~ s/$s/$nue/g;
        # quad Right
        $s = "\\271", $nue=chr(9571); 
        $cuerpo=~ s/$s/$nue/g;
        # quad center
        $s = "\\316", $nue=chr(9580); 
        $cuerpo=~ s/$s/$nue/g;
        # retorno tabs
        $s = "\\301", $nue=chr(9524); 
        $cuerpo=~ s/$s/$nue/g;
        # bell
        $s = "\\235", $nue=chr(9835); 
        $cuerpo=~ s/$s/$nue/g;
        # MERGUE
        $s = "\\344", $nue=chr(8719); 
        $cuerpo=~ s/$s/$nue/g;


$sth = $dbh->prepare($query);
$sth->execute($nro_formato,'',$cuerpo)|| $dbh->errstr;
if ( $DBI::errstr ne "" ){
   print "No puede insertar formato - " . "\n";
  }
$dbh->disconnect;
