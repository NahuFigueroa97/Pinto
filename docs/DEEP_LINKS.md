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

### 2. Sacar el SHA-256 del certificado de firma

**Tiene que ser el del certificado con el que Google Play firma la app**, no
el de tu keystore local. Si usás Play App Signing (lo normal), está en:

> Play Console → tu app → Configuración → Integridad de la aplicación →
> Firma de apps → *Huella digital del certificado SHA-256*

Si firmás vos:

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

Si firmás local **y** con Play App Signing, poné las dos huellas en el
arreglo: durante las pruebas internas conviven.

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
