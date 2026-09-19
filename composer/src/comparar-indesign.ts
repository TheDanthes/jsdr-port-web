/**
 * A/B de la cadena a InDesign: Perl original contra implementación nueva.
 *
 * De los tres eslabones de la cadena, el único que se reescribió es `mac.pl`
 * —cuatro sustituciones y un mapa de secciones—. `xtg2ind.pl`, que es el que
 * de verdad traduce XPress Tags a Tagged Text y son 723 líneas de Perl de
 * 2005, se sigue usando TAL CUAL: no se reescribe lo que no hace falta.
 *
 * Así que lo que hay que demostrar es que reescribir `mac.pl` no cambió un
 * byte. Este programa toma los 58 `.xtg` reales, los pasa por la cadena nueva
 * y compara contra lo que produjo la cadena original (que genera
 * `pruebas/referencia-perl.sh`).
 *
 *     node dist/comparar-indesign.js <carpeta-referencia> <carpeta-xtg>
 */
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { config } from './config.js';
import { transformarComoMacPl } from './componer.js';
import { entornoMotor } from './motor.js';

function porXtg2ind(entrada: Buffer): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    const perl = spawn('perl', [join(config.motor, 'bin', 'xtg2ind.pl')], { env: entornoMotor() });
    const trozos: Buffer[] = [];
    perl.stdout.on('data', (d: Buffer) => trozos.push(d));
    perl.on('error', rechazar);
    perl.on('close', () => resolver(Buffer.concat(trozos)));
    perl.stdin.end(entrada);
  });
}

const [referencia, casos] = process.argv.slice(2);
if (!referencia || !casos) {
  console.error('uso: comparar-indesign <carpeta-referencia> <carpeta-xtg>');
  process.exit(2);
}

const archivos = (await readdir(casos)).filter((f) => f.endsWith('.xtg')).sort();
let ok = 0;
const fallas: string[] = [];

for (const archivo of archivos) {
  const id = basename(archivo, '.xtg');
  const nuevo = await porXtg2ind(transformarComoMacPl(await readFile(join(casos, archivo))));
  const esperado = await readFile(join(referencia, `${id}.txt`));
  if (nuevo.equals(esperado)) {
    ok++;
  } else {
    const hasta = Math.min(nuevo.length, esperado.length);
    let i = 0;
    while (i < hasta && nuevo[i] === esperado[i]) i++;
    fallas.push(
      `${id}: difiere en el byte ${i} (nuevo ${nuevo.length} B, original ${esperado.length} B)`,
    );
  }
}

console.log(`\n  cadena a InDesign: ${ok}/${archivos.length} idénticas byte a byte`);
for (const f of fallas) console.log(`    ${f}`);
process.exit(fallas.length === 0 ? 0 : 1);
