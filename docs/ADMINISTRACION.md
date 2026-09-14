# Administrar Pintó

## Primero: date permisos de admin

**Sin esto no ves el panel.** El rol `admin` no se puede pedir desde la app:
`handle_new_user()` sólo acepta `user` o `business` al registrarse, justamente
para que nadie se registre como administrador.

Se otorga a mano, una vez, en **Supabase Dashboard → SQL Editor**:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users
  where email = 'ponetuemail@ejemplo.com'   -- el mail con el que entrás a la app
);
```

Verificá que haya funcionado:

```sql
select p.role, u.email
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'admin';
```

Cerrá sesión y volvé a entrar en la app. Te va a aparecer
**Perfil → Panel de admin**.

> Funciona desde el SQL Editor porque ahí las consultas corren como
> `postgres`, y el trigger `protect_profile_columns()` deja pasar a
> `postgres`. Desde la app, la misma consulta no haría nada: el cambio de rol
> se descarta en silencio.

---

## Lo que se maneja solo

| Qué | Cuándo | Dónde está |
|---|---|---|
| Envío de notificaciones push | Al instante (1-3 s) | Trigger `on_notification_queued` |
| Reintento de push fallidos | Cada 5 min | Cron `push-retry` |
| Borrado de tokens de dispositivo muertos | Con cada envío | Edge function `send-push` |
| Chat de planes pasados | 30 días después de la fecha del plan | `cleanup_plan_chat()` |
| Solicitudes de planes pasados | 30 días | `cleanup_plan_requests()` |
| Fotos de juntadas | 180 días, con aviso 7 días antes | `cleanup_plan_photos()` |
| Feed de actividad | 60 días | `cleanup_old_feed()` |
| Denuncias ya resueltas | 180 días | `cleanup_old_reports()` |
| Contadores (miembros, planes creados) | En cada alta/baja | Trigger `update_plan_counters()` |
| Límites de abuso | En cada inserción | Triggers de `018_limites_abuso.sql` |
| Verificación de negocios | Al 5º canje de personas distintas | Trigger `on_checkin_verify_business` |
| Ocultar negocios denunciados | A la 3ª denuncia de personas distintas | Trigger `on_report_suspend_business` |

Todo lo de limpieza corre junto, **una vez por día a las 4 AM**
(`run_all_cleanups()`). Para ver qué borró la última corrida:

```sql
select public.run_all_cleanups();   -- devuelve un resumen en JSON
```

Y para ver que los trabajos programados existan:

```sql
select jobname, schedule, active from cron.job;
```

---

## Lo que necesita que entres vos

**Perfil → Panel de admin**, cinco pestañas:

### Negocios — *sólo excepciones*

Desde `020_negocios_autoservicio.sql` **ya no hay que aprobar nada**. Los
negocios se publican al instante marcados como "Sin verificar", y se
verifican solos cuando **5 personas distintas** canjean una promo en el
local. Mientras tanto tienen tope de 2 promos activas y no pueden destacarse
en la portada.

Lo único que queda en esta pestaña es revisar los que se **ocultaron solos**
por denuncias (3 personas distintas) y devolverlos si la denuncia era
infundada. Salen primeros en la lista.

### Denuncias — *obligación de Google Play*

Play exige que las denuncias de contenido se atiendan en un plazo razonable.
Cada una se resuelve o se descarta. Si acumulás denuncias sin tocar y alguien
reporta la app, es un problema de política, no técnico.

### Campañas

Destacar promos (`is_featured`) para que salgan arriba en la home. Es la
palanca editorial: qué se ve primero.

### Verificaciones

Marcar perfiles como verificados. Sube la confianza del resto para sumarse a
sus planes.

### Estadísticas

Conteos generales. Sólo para mirar.

---

## Lo que todavía no existe

**Nada te avisa.** No hay globito en el panel, ni push, ni mail cuando entra
una denuncia o un negocio nuevo. Tenés que acordarte de entrar.

Con poco volumen se maneja mirando una vez por día. Cuando haya movimiento de
verdad va a hacer falta, como mínimo, el contador de pendientes en el acceso
al panel — es la misma lógica que el globito de Avisos.

**`campaign_funnel()`** existe en la base y no tiene pantalla. Responde
cuánta gente vio una promo, cuántos armaron un plan y cuántos canjearon.
Es el dato que le vas a querer mostrar a un comercio para que renueve.

**Cobro de los planes de negocio.** `business_plan()` y `business_limits()`
aplican los límites por plan contratado, pero no hay pasarela de pago: el
alta y la baja se hacen a mano en la base. Para cobrar en Argentina, lo
natural es `preapproval` de Mercado Pago.
