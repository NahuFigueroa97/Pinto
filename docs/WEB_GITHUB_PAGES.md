# Publicar la web gratis en GitHub Pages

## Para qué

Cuando alguien comparte un plan por WhatsApp, quien lo recibe y **no** tiene
la app instalada tiene que caer en algún lado. Sin web, el link no lleva a
ninguna parte.

Es la misma app: `output: 'export'` genera un sitio estático completo, así
que la web y la APK salen del mismo código. No hay que mantener dos cosas.

Tu URL va a ser: **`https://nahufigueroa97.github.io/Pinto/`**

---

## Paso 1 — Subir los cambios

Desde VS Code, pestaña *Source Control*, "Sync Changes". Eso ya sube el
workflow (`.github/workflows/deploy-web.yml`).

## Paso 2 — Cargar las dos claves

El sitio necesita saber a qué Supabase hablarle. En GitHub:

> Tu repo → **Settings** → **Secrets and variables** → **Actions** →
> botón **New repository secret**

Creá estos dos (el nombre tiene que ser exacto):

| Name | Secret |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ogjoggsdsuodbkaunkhq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu clave `sb_publishable_...` |

> **Ojo:** va la clave **publishable / anon**, la misma que ya usás en
> `.env.local`. La `service_role` / `sb_secret_` **nunca** — esa saltea todos
> los permisos de la base y quedaría publicada.
>
> (La anon key es pública por diseño: ya viaja adentro del APK. Va como
> secret sólo por prolijidad.)

## Paso 3 — Prender Pages

> Tu repo → **Settings** → **Pages** → en **Source** elegí
> **GitHub Actions** (no "Deploy from a branch")

## Paso 4 — Esperar

Pestaña **Actions** → vas a ver "Publicar web" corriendo. Tarda unos 2-3
minutos. Cuando termina con el tilde verde, entrá a
`https://nahufigueroa97.github.io/Pinto/`.

De ahí en adelante se republica sola con cada push a `main`.

## Paso 5 — Que la APK sepa dónde está la web

En tu `.env.local` local, agregá:

```
NEXT_PUBLIC_SITE_URL=https://nahufigueroa97.github.io/Pinto
```

Y volvé a compilar la app:

```bash
npm run android:dev
```

Desde ahí, el botón **"Invitar gente a este plan"** comparte un link de
verdad en lugar de sólo el texto.

> Esta variable se inlinea en tiempo de build. Si la cambiás, hay que rehacer
> el build sí o sí — no alcanza con reinstalar.

---

## Si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| Página en blanco | Falta `.nojekyll`. El workflow lo crea; si editaste el workflow, revisá que siga. |
| El Action falla en "Compilar el sitio" | Falta alguno de los dos secrets, o el nombre está mal escrito. |
| Carga pero no muestra datos | La `NEXT_PUBLIC_SUPABASE_ANON_KEY` del secret no es la correcta. |
| 404 en todo | En Settings → Pages, el Source quedó en "Deploy from a branch". |

---

## Después: que el link abra la APP y no el navegador

Esto es opcional y va aparte. Android busca la prueba de propiedad en
**la raíz del dominio**:

```
https://nahufigueroa97.github.io/.well-known/assetlinks.json
                                ^^^^^^^^^^^^ acá, sin /Pinto/
```

Y esa raíz **no pertenece al repo `Pinto`** sino a un repo especial que se
llama igual que tu usuario. Así que hace falta un segundo repo, también
gratis:

1. Creá un repo público llamado exactamente **`NahuFigueroa97.github.io`**
2. Adentro, un archivo en `.well-known/assetlinks.json` con el contenido de
   `docs/assetlinks.ejemplo.json` de este repo, reemplazando la huella
3. Settings → Pages → Source: **Deploy from a branch** → `main` / `/ (root)`
4. En `android/gradle.properties`: `pintoAppLinkHost=nahufigueroa97.github.io`
5. Recompilá la app

La "huella" (SHA-256) sale de:

> Play Console → tu app → **Configuración** → **Integridad de la aplicación**
> → **Firma de apps** → *Huella digital del certificado SHA-256*

Es la de **Google**, no la de tu keystore: cuando subís a Play, Google vuelve
a firmar la app con su propia llave. Poner la tuya es el error clásico —
no funciona y no hay ningún mensaje que te diga por qué.

El detalle completo está en `docs/DEEP_LINKS.md`.
