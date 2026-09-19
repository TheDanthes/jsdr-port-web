BEGIN	{
         cuenta=0
         linea=0
	}

{linea++
 if ( linea < 6 ){
                  print $0
		}
 if ( linea > 5 ) {
                numero=$1
                accii=$2
                conver=$NF
                anchant=$3
                marca=0
                if ( $3 == "0" ) {
				marca=1
                                  }
                
                ancho=00 
                if ( $NF == 0 ){
                  ancho=$3
                  marca=1
                         }
		$1=""
                $2="" 
                $3=""
                $NF=""
                resto=$0
                if ( cuenta > 32 && marca == 0){
                		while ( marca == 0) {
						getline <archivo
                                		if ( $1 == conver ){
								ancho=$2
 								marca=1
								close(archivo)
								}
 						}
                		}
                
 		printf("%s	%s	%s	%s	%s\n", numero, accii, ancho, resto, anchant)
		cuenta++ 
                  }
}

