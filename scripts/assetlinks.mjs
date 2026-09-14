#!/usr/bin/env node
/**
 * Genera el assetlinks.json — el archivo que le prueba a Android que la app
 * y el dominio son de la misma persona.
 *
 * Sin él, un link compartido abre el navegador en vez de la app. Y desde
 * Android 12 no hay término medio: si la verificación no da, el link NO abre
 * la app nunca, ni siquiera preguntando.
 *
 * La parte molesta es sacar las huellas, así que este script intenta la de
 * debug solo y te dice exactamente de dónde sacar la de Play.
 *
 *   node scripts/assetlinks.mjs                       # sólo la de debug
 *   node scripts/assetlinks.mjs AA:BB:CC:...          # + la de Play
 *
 * Las huellas SHA-256 de un certificado son PÚBLICAS: el archivo que se
 * genera acá se publica en internet para que Android lo lea. No son una
 * credencial y no hay nada que proteger.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE_NAME = 'com.pinto.social';

/** La huella del keystore de debug, que es con el que firma `android:dev`. */
function huellaDebug() {
  const keystore = join(homedir(), '.android', 'debug.keystore');
  if (!existsSync(keystore)) return null;

  try {
    // Contraseña y alias del keystore de debug: son fijos y públicos, los
    // define Android Studio igual en todas las instalaciones.
    const salida = execFileSync('keytool', [
      '-list', '-v',
      '-keystore', keystore,
      '-alias', 'androiddebugkey',
      '-storepass', 'android',
      '-keypass', 'android',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

    return salida.match(/SHA256:\s*([A-F0-9:]{95})/i)?.[1] ?? null;
  } catch {
    return null;   // sin keytool en el PATH (viene con el JDK)
  }
}

const normalizar = (h) => h.trim().toUpperCase().replace(/\s/g, '');
const valida = (h) => /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(h);

const huellas = [];

const debug = huellaDebug();
if (debug) {
  huellas.push(debug);
  console.error('✓ Huella de debug encontrada (para probar con `npm run android:dev`)');
} else {
  console.error('⚠ No se pudo leer ~/.android/debug.keystore.');
  console.error('  Se genera la primera vez que compilás en Android Studio.');
  console.error('  Sin ella, el link no va a abrir la app en la versión de prueba.');
}

for (const arg of process.argv.slice(2)) {
  const h = normalizar(arg);
  if (!valida(h)) {
    console.error(`\n✖ "${arg}" no parece una huella SHA-256.`);
    console.error('  Son 32 pares hexadecimales separados por dos puntos:');
    console.error('  AA:BB:CC:DD:... (95 caracteres en total)\n');
    process.exit(1);
  }
  huellas.push(h);
}

if (huellas.length === 0) {
  console.error('\n✖ No hay ninguna huella. Nada que generar.\n');
  process.exit(1);
}

// Únicas, por si se pasó la misma dos veces.
const unicas = [...new Set(huellas)];

console.error('');
console.error('─'.repeat(64));
console.error('Copiá esto en el repo NahuFigueroa97.github.io, en el archivo');
console.error('.well-known/assetlinks.json');
console.error('─'.repeat(64));
console.error('');

// A stdout, para poder redirigirlo a un archivo.
console.log(JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: PACKAGE_NAME,
    sha256_cert_fingerprints: unicas,
  },
}], null, 2));

if (unicas.length === 1 && debug) {
  console.error('');
  console.error('⚠ Falta la huella de Play App Signing. Sin ella, el link va a');
  console.error('  abrir la app en TU teléfono pero no en el de quien la instale');
  console.error('  desde Play: Google vuelve a firmar la app con su propia llave.');
  console.error('');
  console.error('  Play Console > tu app > Configuración > Integridad de la');
  console.error('  aplicación > Firma de apps > Huella digital SHA-256');
  console.error('');
  console.error('  Después: node scripts/assetlinks.mjs AA:BB:CC:...');
}
console.error('');
