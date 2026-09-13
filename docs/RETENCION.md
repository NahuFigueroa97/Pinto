# Retención: qué pasa con los planes que ya pasaron

Implementado en `supabase/migrations/015_retencion_planes.sql` y en la Edge
Function `cleanup-storage`.

---

## La política

| Dato | Se borra | Por qué |
|---|---|---|
| Plan `open` ya vencido | pasa a `closed` a los 7 días | deja de aparecer en los listados |
| **Chat del plan** | 30 días después de la fecha del plan | ya no le sirve a nadie y es lo más sensible que guarda la app |
| **Solicitudes para unirse** | 30 días después | ruido puro una vez que pasó |
| **Fotos** (fila + archivo) | 180 días después | tienen valor sentimental, pero no pueden vivir para siempre en un bucket que se paga por GB |
| Avatares huérfanos | a los 7 días de quedar sin referencia | sobran al cambiar de extensión |
| Miembros del plan | **se conservan** | son el historial "planes recientes" del perfil |
| El plan | **se conserva** | ver abajo |
| Reseñas | **se conservan** | sostienen `reputation_score` |
| Feed de actividad | 60 días | ya existía |
| Notificaciones | 30 días | ya existía |
| Consultas a negocios | 24 h leídas / 7 días sin leer | ya existía |

Los plazos cuentan **desde la fecha del plan**, no desde que se creó la
fila: lo que importa es hace cuánto ocurrió la juntada. Antes el chat se
borraba por antigüedad absoluta (90 días), así que un plan del martes pasado
que ya había ocurrido se guardaba la conversación tres meses más.

---

## Por qué NO se borran los planes

Es la decisión de fondo, y es contraintuitiva:

```sql
plan_reviews.plan_id uuid NOT NULL REFERENCES social_plans(id) ON DELETE CASCADE
```

Borrar un plan viejo se lleva puestas **las reseñas**, y con ellas el
respaldo de `reputation_score`. Quedarían reputaciones sin nada detrás:
imposibles de auditar, imposibles de recalcular, y un vector obvio para
inflarlas.

Además la fila de un plan pesa unos cientos de bytes. Lo que cuesta plata
son las fotos (megabytes en Storage) y lo que compromete privacidad es el
chat. Se borra eso, se conserva el esqueleto.

---

## El aviso antes de borrar

Borrar las fotos de una juntada sin avisar es la clase de cosa que hace que
alguien desinstale la app. `notify_photos_expiring()` manda un push **7 días
antes**, una sola vez por plan, a cada persona que subió fotos:

> **Tus fotos se borran en 7 días**
> Las fotos de "Asado en lo de Marcos" se eliminan la semana que viene.
> Descargá las que quieras guardar.

Con link directo al álbum. `social_plans.photos_expiry_notified_at` evita
repetirlo.

---

## El detalle que cuesta plata

**Borrar de `storage.objects` por SQL no borra el archivo.** Saca la fila de
metadatos, pero los bytes siguen en S3 y se siguen facturando todos los
meses. La baja real hay que pedirla por la API de Storage.

Por eso el barrido SQL **encola** las rutas en `storage_cleanup_queue` y la
Edge Function `cleanup-storage` las borra de verdad:

```
run_all_cleanups()  →  storage_cleanup_queue  →  cleanup-storage  →  S3
   (4:00 diario)         (bucket + path)          (4:15 diario)
```

Si una ruta falla, se marca con el error y no bloquea la cola. Las filas ya
procesadas se descartan a la semana.

---

## Puesta en marcha

```bash
supabase functions deploy cleanup-storage
```

```sql
-- la migración 015 ya programa el barrido diario:
--   cron.schedule('daily-cleanup', '0 4 * * *', 'select public.run_all_cleanups();')

-- falta programar la baja real de archivos, 15 minutos después:
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-storage',
  'edge_function_url_cleanup',
  'Endpoint de cleanup-storage'
);

select cron.schedule('cleanup-storage', '15 4 * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets
                where name = 'edge_function_url_cleanup'),
    headers := public.push_request_headers()
  );
$$);
```

## Probarlo sin esperar al cron

```sql
select public.run_all_cleanups();
```

```json
{
  "plan_chat_deleted": 142,
  "plan_requests_deleted": 8,
  "plan_photos_deleted": 23,
  "avatars_queued": 4,
  "photo_expiry_warnings": 2,
  "storage_pending": 27
}
```

`storage_pending` es lo que quedó esperando a `cleanup-storage`. Si ese
número crece día a día y nunca baja, la Edge Function no se está ejecutando.
