# Compilar e instalar la app Android

Dos flujos distintos, para dos cosas distintas. El 90% del tiempo querés el
primero.

---

## Requisitos

**Node 22 o superior.** `@capacitor/cli` v8 lo exige y no hay ninguna versión
de la v8 que acepte menos. Con Node 20 el build de Next pasa y recién falla en
`cap sync`:

```
[fatal] The Capacitor CLI requires NodeJS >=22.0.0
```

```bash
node -v            # ¿v22 o más?

nvm install 22 && nvm use 22 && nvm alias default 22
rm -rf node_modules && npm ci    # reinstalar tras cambiar de versión de Node
```

El `engine-strict=true` de `.npmrc` hace que `npm ci` corte de entrada si la
versión no alcanza, en vez de dejarte descubrirlo tres pasos después.

---

## A. Probar un cambio en tu teléfono (30-60 s)

Este es el loop de desarrollo. **No pasa por Play Store.** Instala un APK de
debug directo por USB.

### Preparar el teléfono (una sola vez)

1. Ajustes → Información del teléfono → tocar **7 veces** en "Número de compilación"
2. Ajustes → Opciones de desarrollador → activar **Depuración por USB**
3. Conectar por USB y aceptar el diálogo de autorización

Verificá que la compu lo ve:

```bash
adb devices
# List of devices attached
# R58M20XXXX	device      ← si dice "unauthorized", mirá la pantalla del celu
```

Si no tenés `adb`: `sudo apt install android-tools-adb`

### Compilar e instalar

```bash
npm run android:dev
```

Eso hace `next build` → `cap sync android` → `./gradlew installDebug`. Al
terminar, la app ya está actualizada en el teléfono.

### Ver los logs

En otra terminal, **antes** de abrir la app:

```bash
npm run android:logs
```

Filtra lo relevante: `console.log` del WebView, errores de Capacitor y de
Firebase Messaging. Para ver todo sin filtro: `adb logcat`.

### Notas del build de debug

- Se firma solo con la keystore de debug: **no necesitás `keystore.properties`**.
- Usa el mismo `applicationId` (`com.pinto.social`), así que si tenés instalada
  la versión de Play, Android va a rechazar la instalación por firma distinta.
  Desinstalá primero: `adb uninstall com.pinto.social`
- El push **sí funciona** en debug: `google-services.json` es el mismo.

---

## B. Subir a Play Store (testing interno o producción)

### 1. Subir el versionCode

Play rechaza un AAB con un `versionCode` menor o igual a uno ya subido,
**aunque sea a testing interno**. Se edita en un solo lugar:

```properties
# android/gradle.properties
pintoVersionCode=3      ← +1 respecto de la última subida
pintoVersionName=2.0.1  ← lo que ve el usuario
```

Si no te acordás cuál va: Play Console → **Versiones** → *Testing interno* →
mirá el número de la última y sumale 1.

### 2. Generar el AAB

```bash
npm run android:release
```

Queda en:

```
android/app/build/outputs/bundle/release/app-release.aab
```

### 3. La firma

Necesitás `android/keystore.properties` (gitignoreado, nunca va al repo):

```properties
RELEASE_STORE_FILE=/ruta/absoluta/a/tu/pinto.keystore
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_ALIAS=...
RELEASE_KEY_PASSWORD=...
```

> Si ese archivo no existe, el build **compila igual pero sin firmar** y Play
> lo rechaza al subirlo. Es a propósito: antes fallaba con un error críptico
> de keystore que no decía qué faltaba.

**Si perdiste la keystore**: si tenés Play App Signing activado (es lo normal
desde 2021), podés pedir un reseteo de la clave de subida desde Play Console →
Configuración → Integridad de la app. Si no lo tenías, no hay forma de volver
a publicar bajo el mismo `applicationId`.

### 4. Subir

Play Console → Versiones → Testing interno → **Crear nueva versión** → arrastrar
el `.aab`.

Los testers lo reciben en unos minutos por Play Store (o con el link de
opt-in). No es un buen loop para iterar: para eso está el flujo A.

---

## Troubleshooting

**`SDK location not found`**
Falta `android/local.properties`:
```properties
sdk.dir=/home/TU_USUARIO/Android/Sdk
```
(Android Studio lo crea solo la primera vez que abrís el proyecto.)

**`compileSdk 36 requires Android Gradle Plugin 8.9.1 or higher`**
No debería pasar — `android/build.gradle` ya está en AGP 8.9.1. Si aparece, es
que se revirtió ese cambio.

**`Installation failed: INSTALL_FAILED_UPDATE_INCOMPATIBLE`**
Tenés instalada la versión de Play, firmada con otra clave:
```bash
adb uninstall com.pinto.social
```

**La app abre en blanco**
El `out/` no se copió. Corré `npx cap sync android` y revisá que exista
`android/app/src/main/assets/public/index.html`.

**Cambié `.env.local` y la app sigue igual**
Next inlinea las `NEXT_PUBLIC_*` **en tiempo de build**. Hay que rehacer
`next build` + `cap sync` (o sea, `npm run android:dev` de nuevo).

**No llega ningún push**
En orden:
```sql
select platform, updated_at from device_tokens;              -- ¿se registró el aparato?
select status, error from notification_queue order by created_at desc limit 5;
```
Si `device_tokens` está vacío, el problema es del lado de la app: mirá
`npm run android:logs` buscando `[push]`. Si hay token pero la cola dice
`failed`, el problema es del servidor → ver
[FCM_PUSH_NOTIFICATIONS.md](./FCM_PUSH_NOTIFICATIONS.md).

---

## Referencia rápida

| Comando | Qué hace |
|---|---|
| `npm run android:dev` | Build + instalar en el teléfono conectado |
| `npm run android:release` | Build + generar el `.aab` firmado |
| `npm run android:logs` | Logcat filtrado (Capacitor, consola, FCM) |
| `npm run android:clean` | `gradlew clean`, para cuando el build queda raro |
| `npm run open:android` | Abrir el proyecto en Android Studio |
