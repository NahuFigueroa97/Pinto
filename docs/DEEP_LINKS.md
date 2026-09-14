# Links que abren la app (App Links)

## El problema

El botón de compartir existía, pero el link caía en el navegador: quien lo
recibía veía una web, no Pintó. Se perdía ahí el efecto que justifica tener
el botón — y en Argentina WhatsApp es **el** canal de crecimiento.

Con App Links, si la persona tiene Pintó instalada el link abre la app
directamente en el plan; si no la tiene, cae en la web, que es exactamente el
embudo de instalación que se busca.

## Las tres piezas

| Pieza | Dónde | Estado |
|---|---|---|
| `intent-filter` con `autoVerify` | `android/app/src/main/AndroidManifest.xml` | ✅ listo |
| Manejo de la URL entrante | `src/lib/deepLinks.ts` | ✅ listo |
| `assetlinks.json` en el dominio | tu hosting | ⚠️ **falta** |

## Qué falta hacer

### 1. Definir el dominio

En `android/gradle.properties`:

```properties
pintoAppLinkHost=pinto.com.ar
```

Sin esto, el filtro apunta a un `.invalid` que no resuelve y no captura nada
— la app compila y funciona igual, simplemente no toma los links.

El mismo dominio va en `.env.local`:

```
NEXT_PUBLIC_SITE_URL=https://pinto.com.ar
```

De ahí sale el link que arma `src/lib/compartir.ts`. Ojo: se inlinea en
tiempo de build, así que hay que rehacer `next build` y `npx cap sync`.

> Ya está puesto `pintoAppLinkHost=nahufigueroa97.github.io`.

### 2. Sacar las huellas SHA-256

Son **dos**, y hacen falta las dos:

| Cuál | Para qué | De dónde |
|---|---|---|
| **Debug** | Que el link abra la app que instalás vos con `npm run android:dev` | tu `~/.android/debug.keystore` |
| **Play App Signing** | Que el link abra la app de quien la instala desde Play | Play Console |

El script las junta y arma el archivo:

```bash
npm run assetlinks                    # sólo la de debug
npm run assetlinks -- AA:BB:CC:...    # + la de Play
```

Guardarlo directo:

```bash
npm run assetlinks -- AA:BB:CC:... > assetlinks.json
```

> Las huellas SHA-256 **no son secretas**: el archivo que generás se publica
> en internet para que Android lo lea. No hay nada que proteger ahí.

#### La de Play



**Tiene que ser el del certificado con el que Google Play firma la app.** Si
usás Play App Signing (lo normal), está en:

> Play Console → tu app → Configuración → Integridad de la aplicación →
> Firma de apps → *Huella digital del certificado SHA-256*

Si firmás vos, sin Play App Signing:

```bash
keytool -list -v -keystore /ruta/al/pinto.keystore -alias pinto | grep SHA256
```

### 3. Publicar el archivo

En `https://<tu-dominio>/.well-known/assetlinks.json`, servido como
`application/json`, por HTTPS y **sin redirecciones** (Android no las sigue):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.pinto.social",
    "sha256_cert_fingerprints": ["AA:BB:CC:..."]
  }
}]
```

El arreglo admite varias huellas y conviene que estén todas: la de debug, la
de Play y —si firmás local— la tuya. Conviven sin problema.

## Por qué no alcanza con instalar la app

Desde **Android 12 no hay término medio**: si la verificación del dominio no
da, el link **no abre la app nunca**, ni siquiera preguntando. Antes aparecía
un "¿con qué querés abrirlo?"; ahora va directo al navegador y no hay ninguna
señal de que algo falló.

Por eso el `assetlinks.json` no es un extra: sin él, todo el resto del
mecanismo está pero no se activa.

(Como salida manual, el usuario puede ir a Ajustes → Aplicaciones → Pintó →
*Abrir de forma predeterminada* → Agregar enlace. Pero eso no se le puede
pedir a nadie.)

## Probar

Sin dominio todavía, el esquema propio alcanza para verificar el ruteo:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d "pinto://planes/detalle?id=<un-uuid>"
```

Con el dominio configurado:

```bash
# ¿Android verificó el dominio?
adb shell pm get-app-links com.pinto.social

# Forzar la reverificación (útil después de subir el assetlinks.json)
adb shell pm verify-app-links --re-verify com.pinto.social
```

`verified` es lo que se busca. Si dice `legacy_failure` o `unverified`, casi
siempre es una de tres: el archivo no se sirve como `application/json`, hay
una redirección de por medio, o la huella no es la de Play App Signing.

## Seguridad

`src/lib/deepLinks.ts` pasa toda URL entrante por `safeRoute()`, la misma
lista blanca que usan las notificaciones push. Una URL que llega de afuera no
puede convertirse en una navegación arbitraria adentro del WebView: sin ese
filtro, cualquiera podría mandar un link que abra una pantalla que no
debería, o usar la app como redirección abierta.
