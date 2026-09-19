#!/usr/bin/perl 
#use Text::ParseWords;
#Env::import();

#$RS = "\x0d";
#$FS = "[.,:;]";
my %estado;
## inicializa estado
$estado{'guionado'} = 1;
$estado{'guionado_ant'} = 1;
$estado{'linea_base'} = 0;
$estado{'salto_caja'} = 0;
$estado{'primer_salto'} = 0;
$estado{'raya_arriba'} = 0;
$estado{'raya_abajo'} = 0;
$estado{'nlin_parrafo'} = 0; # flag lineas principio y final del parrafo
$estado{'<pdcc:'} = 0;  #Drop cap characters
$estado{'<pdcl:'} = 0;  # Drop Cap Lines
$estado{'<cct:'} = 0;   # grisado
$estado{'<cc:'} = 0;    # Color
$estado{'<cbs:'} = 0;   # desplaza linea base
$estado{'<pkwn:'} = 0;  # permanecer con proximas lineas
$estado{'<cf:'} = 0;    #  cambio de font
$estado{'<ct:'} = 0;    #  estilo font
$estado{'<pli:'} = 0;   # left indent
$estado{'<pfli:'} = 0; 	# indent 1era linea
$estado{'<pri:'} = 0;	# right indent
$estado{'<cl:'} = 0; # interlinea
$estado{'<psb:'} = 0; 	# espacio antes
$estado{'<ptr:'} = 0; 	# tabulado
$estado{'<cs:'} = 0; 	# cuerpo
$estado{'<chs:'}=0;  # alto caracter (heigth)

%fonts;
## tabla fonts
open(FONTS,"</home/jsdr/bin/lista_fonts")
		or die "No se puede abrir el archivo de fonts: $!";
while (<FONTS>) {
	chomp;
	my ($f_orig, $f_cambia) = split /\|/;
	$fonts{$f_orig} = $f_cambia;
}
close(FONTS) or die "No se pudo cerrar archivo de fonts: $!";

my (%varios) =
	    ('0'=> '<pli:', 		# left indent
	     '1'=> '<pfli:', 		# indent 1era linea
	     '2'=> '<pri:',		# right indent
	     '3'=> '<cl:', # interlinea
	     '4'=> '<psb:' , 	# espacio antes
	     '5'=> '' , 	# espacio despues
	     '6'=> '<pga:'  	# alineacion rejilla base
	     );

my (@varios) = sort keys %varios;
#<*d(1,3)> caps caracteres <pDropCapCharacters:1><pDropCapLines:3>

my (%caps) = 
	   ('0'=> '<pdcc:',     #Drop cap characters
	    '1'=> '<pdcl:'      # Drop Cap Lines
	   ); 
my (@caps) = sort keys %caps;

##  <*rb(3,$,$,40,T0,0,7) raya abajo : ancho, stylo, color, shade, borde left, borde right, offset 
## <pRuleBelowStroke:3.000000><pRuleBelowTint:40.000000><pRuleBelowOffset:7.000000><pRuleBelowMode:Text><pRuleBelowOn:1>
#<prbs:3.000000><prbt:40.000000><prbm:Text><brbo:7.0000><prbon:1>

my (%raya_abajo) =
		  ('0'=> '<prbs:',	# ancho raya
		   '1'=> '' ,		# estilo
		   '2'=> '<prbc:', 		# color
		   '3'=> '<prbt:',	# shade
		   '4'=> '<prbli:',	# borde izquierdo
		   '5'=> '<prbri:' ,    # borde derecho
		   '6'=> '<prbo:'       # offset
		   );
my (@raya_abajo) = sort keys %raya_abajo;
my (%raya_arriba) =
		  ('0'=> '<pras:',	# ancho raya
		   '1'=> '' ,		# estilo
		   '2'=> '<prac:', 		# color
		   '3'=> '<prat:',	# shade
		   '4'=> '<prali:',	# borde izquierdo
		   '5'=> '<prari:'	 ,       # borde derecho
		   '6'=> '<prao:'       # offset
		   );
my (@raya_arriba) = sort keys %raya_arriba;

my (%lista_tabs) = (
                    '0'=> 'Left',
                    '1'=> 'Center',
                    '2'=> 'Right'
                    );
my (@lista_tabs) = sort keys %lista_tabs;

print "<ASCII-WIN>" . "\x0d\n";
print "<Version:4><FeatureSet:InDesign-Roman><ColorTable:=<Black:COLOR:CMYK:Process:0,0,0,1>>" . "\x0d\n";

$buffer="";
$normal=0;
$hay_estilo=0;
$est_pta=1;
$str_estilo="";
#$str_normal="<pri:0><pli:0><pfli:0><cl:10><pkwn:><cf:Helvetica><ct:Regular><cs:10><pta:JustifyLeft><cbs:0>";
$str_normal="";
foreach $linea (<>) {
     $linea=filtro_car($linea);
     # alineacion
     $linea =~ s/<\*J>/<pta:><pta:JustifyLeft>/g;
     $linea =~ s/<\*C>/<pta:><pta:Center>/g;
     $linea =~ s/<\*R>/<pta:><pta:Right>/g;
     $linea =~ s/<\*L>/<pta:><pta:Left>/g;
     # espacios fijos
     $linea =~ s/<\\p\\f>/<0x2008><0x2002>/g;
     $linea =~ s/<\\!p\\!f>/<0x2008><0x2002>/g;
     $linea =~ s/<\\f>/<0x2002>/g;
     $linea =~ s/<\\p>/<0x2008>/g;
     $linea =~ s/<\\!p>/<0x2008>/g;
     $linea =~ s/<\\!f>/<0x2002>/g;
     $linea =~ s/<\\!s>/<0x00A0>/g;
     $linea =~ s/<\*rb0\*ra0\*kn0>/<*rb0><*ra0><*kn0>/g;
     $linea =~ s/(<z[0-9.]*)(h100>)/$1><$2/g;
     ## Small caps
     #@n=split("<K>", $linea); <ccase:All Caps>
     @n=split("<H>", $linea);
     if ( @n > 1 ) {
       $estado_h = 0;
       for ($k=1; $k<=(@n - 1);$k++) {
           if ( $estado_h == 0 ) {
               $n[$k]="<ccase:Small Caps>" . $n[$k];
               $estado_h = 1
           }
           else {
               $n[$k]="<ccase:>" . $n[$k];
               $estado_h = 0
           }
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }
     #$linea =~ s/<H>.*<H>{1}?/<ccase:Small Caps>$&<ccase:>/g;
     #$linea =~ s/<H>//g;
     ## Italica
     $linea =~ s/<I>/<csk:12>/g; # Italica
     $linea =~ s/<P>/<csk:>/g;  # Plain

     # Corte (estilos H y J) Ver si no cambian condiciones de corte de palabras

     if ( $linea =~ /<\*h~Bandera~\>/ ) {
         if ( $estado{'guionado'} == 1 ) {
              $estado{'guionado_ant'} = $estado{'guionado'};
              $estado{'guionado'} = 0;
         }
         $linea =~ s/<\*h~Bandera~\>//g;
     }
     if ( $linea =~ /<\*h~Estándar~\>/ ) {
          if ( $estado{'guionado'} == 0 ) {
              $estado{'guionado_ant'} = $estado{'guionado'};
              $estado{'guionado'} = 1;
          }
          $linea =~ s/<\*h~Estándar~\>//g;
     }

     ## Estilos indesign
     @n=split("<\\*e", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n - 1);$k++) {
           @resultado=split(">", $n[$k]);
           $cambia="<pstyle:" . $resultado[0] . ">";
           $cambia=~ s/~i/\xed/g;  ## para generar i con acento
           $cambia=~ s/~u/\xfa/g;  ## para generar u con acento
           $cambia=~ s/~a/\xe1/g;  ## para generar a con acento
           $cambia=~ s/~o/\xf3/g;  ## para generar o con acento
           $cambia=~ s/~e/\xe9/g;  ## para generar o con acento
           $cambia=~ s/_/\x15/g;  ## para generar o con acento
	   $nueresul=$resultado[0];
	   $nueresul=~ s/\+/\\\+/g;
           $nueresul =~ s/\(/\\\(/g;
           $nueresul =~ s/\)/\\\)/g;
           $nueresul =~ s/\:/\\:/g;
           $reemplaza="<\\*e" . $nueresul . ">";
           $linea =~ s/$reemplaza//g;
           $str_estilo= $cambia;
           $normal=1;
           $hay_estilo=1;
           $est_pta = 1;
           $estado{'<pkwn:'} =1;
           $estado{'<pfli:'} =1;
	   $estado{'<cf:'} = 1;
	   $estado{'<ct:'} = 1;
	   $estado{'<pli:'} = 1;
	   $estado{'<pri:'} = 1;	# right indent
           $estado{'<psb:'} = 1; 	# espacio antes
           $estado{'<cct:'}=1;
           $estado{'<cc:'}=0;
           $estado{'<cbs:'}=1;
           $estado{'<cs:'}=1;
           $estado{'<chs:'}=1;  # alto caracter (heigth)
	   $estado{'<cl:'} = 1; # interlinea
           $estado{'<ptr:'} = 1;
           $estado{'raya_arriba'}=0;
	   $estado{'raya_abajo'}= 0;
           $estado{'linea_base'} = 0;
       }
     }

     #captura e interpretacion
     $linea=~ s/<\*kn/<kn/g;
     $linea=extrae_datos("<z", "<cs:", 1, 1, 0, $linea);
     $linea=extrae_datos("<kn", "<pkwn:", 1, 1, 0, $linea);
     $linea=extrae_datos("<h", "<chs:", 0.01, 1, 0, $linea);
     $linea=extrae_datos("<-t", "<ctk:", -1, 0, 0, $linea);
     $linea=extrae_datos("<t", "<ctk:", 1, 0, 0, $linea);
     $linea=extrae_datos("<b", "<cbs:", 1, 1, 0, $linea);
     $linea=extrae_datos("<s", "<cct:", 1, 1, 0, $linea); # % grisado
     $linea=extrae_string("<c~", "<cc:", 1, $linea); # color
     ## salto caja <\b>
     $str_salto="";
     if ( $estado{'salto_caja'} == 0 && $estado{'primer_salto'} == 1 ) {
        $str_salto = "<cnxc:>";
        $estado{'primer_salto'} = 0;
     }
     #if ( $linea=~ /<\\b>/ ) {
          #$linea=~ s/<\\b>/\x0d\n/g;
          #$estado{'salto_caja'} = 1;
     #}
     if ($estado{'salto_caja'} == 1 ) {
        $str_salto .= "<cnxc:Box>";
        $estado{'salto_caja'} = 0;
        #$estado{'primer_salto'} = 1;
     }
     $linea = $str_salto . $linea;
     ## Estilos indesign
     # datos especiales
     ## interlinea , espacio antes y despues , etc (*p)
     @n=split("<\\*p\\(", $linea);
     $final_base="";
     $dato_linea_base="";
     if ( @n > 1 ) {
       for ($k=1; $k<(@n -1);$k++) {
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
       }
           $k == @n -1 ;
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split(",", $resultado[0]);
           $nuevo ="";
           $j=-1; 
           foreach $datos (@valor) {
            $j++;
            if ( $j == 6 ) {
               if ( $datos eq "G" ) {
                 $final_base = "G";
               }
               else { 
                     $final_base = "g";
               }
               next;
            }
            if ( length($varios{$j}) > 0 && $datos ne "\$") { 
              if ( $estado{$varios{$j}} == 0 ) {
                  $nuevo .= $varios{$j} . ">";
              }
              $estado{$varios{$j}} = 0;
              $nuevo .= $varios{$j} . $datos . ">";
            }
           }
           $n[$k]=$nuevo . $n[$k];
       #}
       #print "$final_base -- estado: $estado{'linea_base'}\n";
       if ( $final_base eq "G" && $estado{'linea_base'} == 0 ) {
           $dato_linea_base = $varios{6} . "BaseLine" . ">";
           $estado{'linea_base'} = 1;
       }
       if ( $final_base eq "g" && $estado{'linea_base'} == 1 ) {
           $dato_linea_base = $varios{6} . "None>";
           $estado{'linea_base'} = 0;
       }
       #$linea=$dato_linea_base;
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }
     ## tabulados <*t(21.00,2,~,~,22.42,0,~ ~,26.00,0,~ ~,95.00,0,~ ~)>
     @n=split("<\\*t\\(", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split(",", $resultado[0]);
           $nuevo ="";
           $j=0;
           $ancho=0;
           $tipotab="";
           $ancho_ant=0;
           $tipotab_ant="";
           %tabulados="";
           foreach $datos (@valor) {
            $j++;
            ## en las posiciones 1, 5, etc van los anchos
            ## en las posiciones 2, 6, etc va el tipo right or left o center
            if ( $j == 1 ) { 
               #$nuevo .= $datos;
               $ancho = $datos ;
            }
            ##tipo
            if ( $j == 2 ) { 
               #$nuevo .= $lista_tabs{$datos} ;
               $tipotab = $lista_tabs{$datos};
            }
            #$nuevo .= ",";
            if ( $j == 3 ) { 
               $j=0;
               $tabulados{$ancho} = $tipotab 
               #if ( $ancho_ant > 0 && ($ancho - $ancho_ant) == 0.3 &&
                     #$tipotab_ant eq "Left" && $tipotab eq "Center" ) {
                    #$ancho_ant=0;
               #}
               #$nuevo .= "\;";
               #if ( $ancho_ant > 0 ) {
                  #$nuevo .= $ancho_ant . "," . $tipotab_ant . ",,\;";
               #}
               #$ancho_ant = $ancho;
               #$tipotab_ant = $tipotab;
            };
           }
           #my (@tab_ordenados) = sort keys %tabulados;
           #my (@tab_ordenados) = (sort {$a <=> $b} keys %tabulados)
           #if ( $ancho_ant > 0 ) {
            #   $nuevo .= $ancho_ant . "," . $tipotab_ant . ",,\;";
           #}
           $tabulados = "{" . $tabulados . "}"; 
           foreach $ancho (sort {$a <=> $b} keys %tabulados) {
                if ( $ancho > 0 ) {
                   $tipotab = $tabulados{$ancho};
                   if ( $ancho_ant > 0 && $tipotab_ant eq "Left" &&
                        $tipotab eq "Center" &&
                        ($ancho - $ancho_ant) == 3 ) {
                        $ancho_ant = $ancho;
                        $tipotab_ant = $tipotab;
                        next;
                   }
                   if ( $ancho_ant > 0 ) {
                      $nuevo .= $ancho_ant . "," . $tipotab_ant . ",,\;";
                   }
                   $ancho_ant = $ancho;
                   $tipotab_ant = $tipotab;
                }
           }
           if ( $ancho_ant > 0 ) {
                      $nuevo .= $ancho_ant . "," . $tipotab_ant . ",,\;";
           }
           $ptr_ant="";
           if ( $estado{'<ptr:'} == 0 ) {
                $ptr_ant= "<ptr:>";
           }
           $estado{'<ptr:'} = 0;
           $n[$k] = "$ptr_ant<ptr:$nuevo>$n[$k]";
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }

     #<*d(1,3)> caps caracteres <pDropCapCharacters:1><pDropCapLines:3>
     #<*d0> es reset
     $linea=~ s/<\*d0>/<*d(0,0)>/g;
     @n=split("<\\*d\\(", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split(",", $resultado[0]);
           $nuevo ="";
           $j=-1; 
           foreach $datos (@valor) {
            $j++;
            if ( length($caps{$j}) > 0 ) { 
              if ( ! $datos == $estado{'$caps{$j}'} ) {
                #$nuevo .= $caps{$j} . ">";
                $nuevo .= $caps{$j} . $datos . ">";
                $estado{'$caps{$j}'} = $datos;
              }
            }
           }
           $n[$k]=$nuevo . $n[$k];
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }

     ## reset raya
     $linea=~ s/<\*ra0\*rb0>/<*ra0><*rb0>/g;
     if ( $linea =~ /<\*rb0>/ ) {
        if ( $estado{'raya_abajo'} == 1 ) {
             $linea=~ s/<\*rb0>/<prbon:>/g;
        }
        else { 
              $linea=~ s/<\*rb0>//g;
        }
        $estado{'raya_abajo'}=0;
     } 
     if ( $linea =~ /<\*ra0>/ ) {
        if ($estado{'raya_arriba'} == 1 ) { 
            $linea=~ s/<\*ra0>/<praon:>/g;
        }
        else { 
            $linea=~ s/<\*ra0>//g;
        }
        $estado{'raya_arriba'}=0;
     } 
     ## raya abajo
     @n=split("<\\*rb\\(", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split(",", $resultado[0]);
           $nuevo ="";  
           $j=-1; 
           foreach $datos (@valor) {
              $j++;
	      $datos =~ s/~//g;
              if ( length($raya_abajo{$j}) > 0 && $datos ne "\$") { 
                 if ( $j == 4 ) {
                    if ( $datos =~ /^T/ ) { 
                       $datos=~ s/^T//; 
                       $est_prbm=1;
                       $nuevo .= "<prbm:Text>";
                    };
                 }
                 if ( $datos < 0 && ($j == 4 || $j == 5) ) {
                      $datos = 0;
                 } 
                 $nuevo .= $raya_abajo{$j} . $datos . ">";
               }
            }
            $nuevo .= "<prbon:1>";  # pone raya abajo activa
            $n[$k]=$nuevo . $n[$k];
            $estado{'raya_abajo'}=1;
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }
     ## raya arriba
     @n=split("<\\*ra\\(", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
           @resultado=split("\\)\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 2;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split(",", $resultado[0]);
           $nuevo ="";  
           $j=-1; 
           foreach $datos (@valor) {
            $j++;
	    $datos =~ s/~//g;
            if ( length($raya_arriba{$j}) > 0 && $datos ne "\$") { 
                 if ( $j == 4 ) {
                    if ( $datos =~ /^T/ ) { 
                       $datos=~ s/^T//; 
                       $est_pram=1;
                       $nuevo .= "<pram:Text>";
                    };
                 }
                 if ( $datos < 0 && ($j == 4 || $j == 5) ) {
                      $datos = 0;
                 } 
              $nuevo .= $raya_arriba{$j} . $datos . ">";
            }
           }
           $nuevo .= "<praon:1>";  # pone raya abajo activa
           $estado{'raya_arriba'}=1;
           $n[$k]=$nuevo . $n[$k];
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }
     ## lineas a permanecer dentro del parrafo
     $null_nlin="<pkfnl:><pknl:>";
     $linea=~ s/<\*kt0>/<*kt(0,0)>/g;
     @n=split("<\\*kt\\(", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
                @resultado=split("\\)\\>", $n[$k]);
                $largo_total=length($n[$k]);
                $largo=length($resultado[0]) + 2;
                $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
                @valor=split(",", $resultado[0]);
                $primeras_lineas=$valor[0];
                $ultimas_lineas=$valor[1];
       }
       $linea="";
       if ( $primeras_lineas >= 0 || $ultimas_lineas >= 0 ) {
          $linea .="<pkfnl:" . $primeras_lineas . "><pknl:" . $ultimas_lineas . ">";
          $estado{'nlin_parrafo'} = 1;
       }
       else {
          $estado{'nlin_parrafo'} = 0;
       }
       foreach (@n) {
           $linea .= $_;
       }
     }

     ## Procesar fuentes <*f"News701BT-BoldA"P>
     # se debe rescatar nombre font y estilo P = Plain --> regular
     ## El nombre se traduce <cFont:News701BT-BoldA>
     ## El estilo <cTypeface:Bold> or <ct:Regular> , <ct:Bold>, <ct:Italic>
     ## El problema es que hay fonts que pueden no tener ese estilo
     ## y hay que llevarla a otra font 
     @n=split("<\\*f~", $linea);
     if ( @n > 1 ) {
       for ($k=1; $k<=(@n -1);$k++) {
           @resultado=split("\\>", $n[$k]);
           $largo_total=length($n[$k]);
           $largo=length($resultado[0]) + 1;
           $n[$k]=substr($n[$k], $largo, ($largo_total - $largo));
           @valor=split("~", $resultado[0]);
           $font=$valor[0];
           $estilos=$valor[1];
           $tipo="";
           $data_font="<" . $font . ">" . $estilos;
           $nueva_font=$fonts{$data_font};
           if ( $nueva_font eq "" ) {
                if ( $estilos eq "PP" ) {$tipo="Regular"};
                if ( $estilos eq "PB" ) {$tipo="Bold"};
                if ( $estilos eq "PI" ) {$tipo="Italic"};
                if ( $estilos eq "PBI" ) {$tipo="Bold Italic"};
           }
           else {
                ($basura, $font, $tipo) = split(/[><]/, $nueva_font);
           }
           if ( $tipo eq "") { $tipo = "Regular"};
           #$n[$k]="<cf:" . $font . ">" . "<ct:><ct:" . $tipo . ">" . $n[$k];
           $font_anterior="";
           $ct_anterior = "";
           if ( $estado{'<cf:'} == 0 ) {
              $font_anterior = "<cf:>";
           }
           $estado{'<cf:'} = 0;
           if ( $estado{'<ct:'} == 0 ) {
              $ct_anterior = "<ct:>";
           }
           $estado{'<ct:'} = 0;
           $n[$k] =$font_anterior . "<cf:" . $font . ">" . $ct_anterior . "<ct:" . $tipo . ">" . $n[$k];
       }
       $linea="";
       foreach (@n) {
           $linea .= $_;
       }
     }


      @t=split("<pta:>", $linea);
      $est_ant_pta = $est_pta;
      if ( @t >= 2 ) {
            $k = (@t -1);
            if ( $t[$k]=~ /^<pta:JustifyLeft>/ )  {
               $linea=~ s/<pta:><pta:Center>//g;
               $linea =~ s/<pta:><pta:Right>//g;
               $linea =~ s/<pta:><pta:Left>//g;
               $est_pta = 0;
            }
            if ( $t[$k]=~ /^<pta:Center>/ )  {
               $linea=~ s/<pta:><pta:JustifyLeft>//g;
               $linea =~ s/<pta:><pta:Right>//g;
               $linea =~ s/<pta:><pta:Left>//g;
               $est_pta = 0;
            }
            if ( $t[$k]=~ /^<pta:Right>/ )  {
               $linea=~ s/<pta:><pta:Center>//g;
               $linea =~ s/<pta:><pta:JustifyLeft>//g;
               $linea =~ s/<pta:><pta:Left>//g;
               $est_pta = 0;
            }
            if ( $t[$k]=~ /^<pta:Left>/ )  {
               $est_pta = 0;
            }
        }
        if ( $est_ant_pta > 0 ) {
              $linea=~ s/<pta:>//g;
        }
           
        if ( length($buffer) > 0 ) { 
                $buffer =~ s/_/<0x2014>/g;
                $buffer =~ s/\x15/_/g;
		print $buffer . "\x0d\n"
	};
	#print "BUffer: $normal -- estado base: $estado{'linea_base'}\n";
        if ( $normal > 0 ) {
           if ( $estado{'linea_base'} == 1 ) {
              $buffer = $str_estilo . $str_normal . $dato_linea_base . "<ph:" . $estado{'guionado'} . ">" . $linea;
              }
           else {
              $buffer = $dato_linea_base . $str_estilo . $str_normal . "<ph:" . $estado{'guionado'} . ">" . $linea;
              }
           $normal = 0;
           $str_normal="";
        }
        else {
           if ( $hay_estilo > 0 ) {
              $buffer = $dato_linea_base . "<ph:><ph:" . $estado{'guionado'} . ">" . $linea;
           }
           else {
                $buffer = $dato_linea_base  . "<pstyle:><ph:" . $estado{'guionado'} . ">" . $linea;
           }
        }
	#print "$buffer\n";
}
## Final input
if ( length($buffer) > 0 ) { 
   $txtneto = "";
   @n=split("<", $buffer);
    if ( @n > 1 ) {
       for ($k=1; $k<=(@n - 1);$k++) {
           @resultado=split(">", $n[$k]);
           $txtneto .= $resultado[1];
       }
    }
    else { print $buffer };
    if ( length($txtneto) > 0 ) { print $buffer};
}

sub extrae_datos {
    my ($filtro, $nuevo, $mult, $resetea, $nulifica, $datos) = @_;
    #my $anterior = $nuevo . "\*>";
    @n=split($filtro, $datos);
    if ( @n > 1 ) {
       #print "DATOS= $datos\n";
       for ($k=1; $k<=(@n - 1);$k++) {
           @resultado=split(">", $n[$k]);
           @valor=split("[a-z>]", $n[$k]);
           #print "EXTRAE $nuevo --$resultado[0] $estado{$nuevo} -- $resetea\n";
           my $cambia=$nuevo;
           if ( $resetea == 1 ) {
               if ( $estado{$nuevo} == 0 ) {
                   $cambia .= ">" . $nuevo;
               }
               $estado{$nuevo} = 0;
           }
           if ( $valor[0] == 0 && $nulifica == 1) { 
		$cambia .= ">";
           }
           else {
                $cambia .= ($valor[0]  * $mult) . ">";
           }
#print "CAMBIO = $cambia\n";
           $filtro=~ s/\*/\\*/g;
           $reemplaza=$filtro . $resultado[0] . ">";
           #$datos =~ s/$anterior//g;
           #print "DATOS = $datos -- $anterior\n";
           $datos =~ s/$reemplaza/$cambia/;
       }
    }
    return $datos;
}
sub extrae_string {
    my ($filtro, $nuevo, $resetea, $datos) = @_;
    @n=split($filtro, $datos);
    if ( @n > 1 ) {
       for ($k=1; $k<=(@n - 1);$k++) {
           @resultado=split("~>", $n[$k]);
	   $nuevo_str = $nuevo;
           if ( $resetea == 1 ) {
               if ( $estado{$nuevo} == 1 ) {
                   $nuevo_str=$nuevo . ">";
		   if ( length($resultado[0]) > 0  ) {
                   	$nuevo_str .=$nuevo;
		   }
                   $estado{$nuevo} = 0;
               }
               else { $estado{$nuevo} = 1};
           }
           $cambia=$nuevo_str . $resultado[0] . ">";
           $filtro=~ s/\*/\\*/g;
           $reemplaza=$filtro . $resultado[0] . "~>";
           $datos =~ s/$reemplaza/$cambia/g;
       }
    }
    return $datos;
}

exit;
sub filtro_car($linea){
     $linea =~ s/\x0d//g;   # Elimina 0d
     $linea =~ s/\x0a//g;   # Elimina 0a
     $linea =~ s/\@Normal:\@Normal:/\@Normal:/g;
     $linea =~ s/<v1.70><e0>//g;
     $linea =~ s/ $//g;
     #$linea =~ s/_/<0x2014>/g;
     $linea =~ s/\x27/<0x2019>/g;
     $linea =~ s/\xae/<0x00AB>/g; # comillas francesas abrir
     $linea =~ s/\xaf/<0x00BB>/g; # comillas francesas cerrar
     $linea =~ s/\xc5/\x86/g; # cruz comun
     $linea =~ s/<\*cb>/\xf9/g; # 

     #$linea =~ s/.*\@Normal:{1}?/\0x0a$&/g;
     $linea =~ tr/\xa0\x82\xa1\xa2\xa3\x85\x8a\x8d\x95\x97\x81\x89\xa4\xa5\xa8\xad\xef\xa6\xa7\x27\x87\x80\xf9/\xe1\xe9\xed\xf3\xfa\xe0\xe8\xec\xf2\xf9\xfc\xeb\xf1\xd1\xbf\xa1\x94\xaa\xba\xb4\xe7\xc7\x95/;
     return $linea
}
