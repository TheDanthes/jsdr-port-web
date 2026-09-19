BEGIN	{
         cuenta=32
	}

{cuenta++
 valor = $0 + 0
 ancho = valor * 0.054
 resto = (( valor * 54 ) % 1000) / 1000
 ancho = ancho - resto
 if ( resto > 0.5 )
   {
   ancho = ancho + 1
   }
 
 printf("%s	%s\n", cuenta, ancho)
}

