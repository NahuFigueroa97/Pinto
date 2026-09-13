# Ofertas comerciales y monetización

Cómo funciona el circuito que le da sentido a Pintó, qué quedó implementado
y qué falta decidir.

---

## El circuito

```
  NEGOCIO                    USUARIOS                    MOSTRADOR
  ───────                    ────────                    ─────────
  publica una promo
  condicionada          →    ve "45% si vienen 3"
     │                              │
     │                       arma un plan
     │                       e invita gente
     │                              │
     │                       el grupo crece
     │                       → sube el escalón
     │                              │
     │                       reserva con QR       →    escanea
     │                                                 valida hora/día/grupo
     │                                                 aplica el descuento
     └──────── métricas de conversión ◄───────────     suma sello de fidelidad
```

Lo que hace distinta a Pintó de un cupón: **el beneficio crece con el tamaño
del grupo**. Un cupón individual no necesita una red social. Una escalera
`2→20% / 4→35% / 6→50%` convierte a cada usuario en alguien que sale a
buscar gente, que es exactamente la "activación comercial" del pitch.

---

## Qué había antes

Las condiciones vivían en `campaigns.price_text`, un campo de texto libre:

```
price_text = "45% off viniendo 3 o más hasta las 19hs"
```

Nada de eso era interpretable por el código. No se podía:

- mostrar cuánta gente falta para el próximo beneficio
- validar la franja horaria en el check-in
- calcular el descuento en el mostrador
- medir qué promo convierte mejor

Y `pricing_plans` / `business_subscriptions` existían desde `001_schema.sql`
pero **ninguna línea de código las leía**: cualquier negocio podía publicar
campañas sin límite. La parte monetaria era una tabla vacía.

---

## Modelo de datos

### `campaign_tiers` — la escalera

```sql
campaign_id | min_people | discount_type | discount_value | label
------------+------------+---------------+----------------+-------
 <promo>    |     2      | percent       |       20       | null
 <promo>    |     4      | percent       |       35       | null
 <promo>    |     6      | percent       |       50       | null
```

Una sola fila es el caso simple del ejemplo: `min_people=3, percent, 45`.

`discount_type`: `percent` | `fixed` | `two_for_one` | `free_item`.
`label` es opcional: si es `NULL` se arma solo con `tier_label()`.

### Condiciones en `campaigns`

| Columna | Para qué |
|---|---|
| `valid_weekdays int[]` | `{1,2,3,4,5}` = solo días de semana. `NULL` = todos |
| `valid_from_time` / `valid_until_time` | la franja del día: "hasta las 19" |
| `max_redemptions_total` | cupo global, genera urgencia |
| `max_redemptions_per_user` | evita que la misma persona lo use 20 veces |
| `redemptions_count` | consumido, lo mantiene el check-in |
| `terms` | letra chica |

### `businesses.timezone`

"Hasta las 19" es hora **local del local**, no UTC. Sin esto la franja se
corre 3 horas en Argentina — el mismo error que hizo desaparecer los planes
de hoy del listado. Default `America/Argentina/Catamarca`.

---

## La función que decide todo

```sql
select public.campaign_offer('<campaign_id>', 4);
```

```json
{
  "ok": true,
  "reasons": [],
  "party_size": 4,
  "local_time": "18:42",
  "tier":      { "min_people": 4, "discount_type": "percent",
                 "discount_value": 35, "label": "35% OFF" },
  "next_tier": { "min_people": 6, "people_missing": 2, "label": "50% OFF" },
  "slots_left": 12
}
```

**Una sola fuente de verdad.** La usan la ficha de la promo, el detalle del
plan y el check-in. Si la evaluación viviera en el cliente, lo que ve el
usuario y lo que valida el mostrador podrían discrepar — y esa discrepancia
la sufre el comerciante en la caja.

Cuando no aplica, `reasons` dice por qué: *"No aplica este día de la
semana"*, *"Aplica hasta las 19:00"*, *"Se agotaron los cupos"*.

---

## Los planes de suscripción

| | Gratis | Starter $4.999 | Pro $12.999 |
|---|---|---|---|
| Promos activas | 2 | 10 | 50 |
| Escalones por promo | 1 | 3 | 10 |
| Destacadas | 0 | 2 | 10 |
| Fidelidad | — | ✓ | ✓ |
| Métricas | — | ✓ | ✓ |

**Los límites se enforzan en la base**, con los triggers
`enforce_campaign_quota` y `enforce_tier_quota`. No en el cliente: el cliente
es un APK con la anon key adentro, así que cualquier límite que solo viva ahí
es decorativo — se saltea con una llamada HTTP.

El escalonado no es arbitrario: **1 escalón en el plan gratis** hace que la
escalera —la función más valiosa— sea justamente la razón para pagar.

### Lo que falta: el cobro

No hay pasarela integrada. `/negocio/plan` muestra los planes y abre un mail
a soporte; la suscripción se activa a mano:

```sql
insert into business_subscriptions (business_id, plan_id, status)
values ('<business>', (select id from pricing_plans where slug='starter'), 'active');
```

Para automatizarlo, en Argentina lo natural es **Mercado Pago** con
suscripciones (`preapproval`): un webhook a una Edge Function que inserte o
cancele la fila de `business_subscriptions`. La tabla ya está preparada
(`status`, `starts_at`, `ends_at`).

---

## Métricas: lo que justifica pagar

```sql
select public.campaign_funnel('<campaign_id>');
```

```json
{
  "views": 340,
  "plans_created": 12,
  "reservations": 28,
  "people_reserved": 79,
  "checkins": 21,
  "redemptions": 19,
  "conversion_view_to_reservation": 8.2,
  "conversion_reservation_to_checkin": 75.0
}
```

`plans_created` es la métrica propia de Pintó: cuántos grupos se armaron
alrededor de esa promo. Ningún sistema de cupones puede mostrar eso, y es el
argumento de venta más fuerte que tiene la app frente a un comerciante.

> Está implementada pero **todavía no tiene pantalla**. Es lo primero que
> sumaría del listado de abajo.

---

## Ideas, ordenadas por relación valor/esfuerzo

### 1. Happy hour dinámico ⭐
La promo se activa sola en las franjas flojas. El negocio ya carga
`valid_from_time`/`valid_until_time`; faltaría sugerirle las horas con menos
check-ins históricos: *"los martes de 15 a 18 tenés el local vacío, probá una
promo ahí"*. Datos ya los tenés en `checkins`.

### 2. Cupo con cuenta regresiva visible
`max_redemptions_total` ya existe y `campaign_offer` devuelve `slots_left`.
Mostrar **"quedan 6 de 50"** en la ficha es media hora de trabajo y mueve la
aguja: la escasez convierte.

### 3. Pantalla de métricas para el negocio
`campaign_funnel()` está lista. Una pantalla con el embudo por promo es el
mejor argumento para que el comerciante renueve.

### 4. Promo de recuperación
Alguien reservó y no fue (`status='no_show'`) → a los 7 días le llega un
push con una promo del mismo local. El sistema de notificaciones ya está
entero; es un trigger más.

### 5. Comisión por check-in, en vez de suscripción
Para un comercio chico de Catamarca, $4.999/mes fijos puede ser una barrera
más alta que pagar $200 por cada persona que efectivamente entró. Cobrar por
resultado baja muchísimo la fricción de venta inicial. `redemptions` ya
registra cada canje con su descuento: la base para facturar por uso ya está.
Un modelo mixto (plan gratis + comisión) suele funcionar mejor que uno u otro.

### 6. Promo de estreno para negocios nuevos
Los primeros 30 días con el plan Starter gratis. `business_subscriptions.ends_at`
ya lo soporta sin tocar nada.

### 7. "Invitá y desbloqueás"
Compartir el plan por WhatsApp con un link de invitación. Ya está el botón de
"avisale a alguien dónde voy"; el mismo mecanismo con un deep link al plan
convierte cada plan en un canal de captación.

### 8. Reseña del local después del check-in
Hoy solo se valoran las personas (`plan_reviews`). Valorar al negocio le da
reputación pública y te da contenido que hace ranking en la app.

### 9. Destacadas pagas por semana
`is_featured` ya existe y hoy solo lo toca un admin. Venderlo por semana
suelta —sin suscripción— es ingreso incremental fácil.

### 10. Combo entre locales
Café + bar de la misma cuadra arman una promo conjunta. Es diferencial y
difícil de copiar, pero requiere modelar promos multi-negocio: dejarlo para
cuando el circuito base esté validado.

---

## Cómo probarlo

```sql
-- promo de ejemplo: café 45% off, 3+ personas, L-V hasta las 19
update campaigns
set valid_weekdays   = '{1,2,3,4,5}',
    valid_until_time = '19:00',
    terms            = 'No acumulable con otras promociones.'
where id = '<campaign_id>';

insert into campaign_tiers (campaign_id, min_people, discount_type, discount_value)
values ('<campaign_id>', 3, 'percent', 45);

-- ¿qué ve un grupo de 2? ¿y uno de 3?
select public.campaign_offer('<campaign_id>', 2);   -- next_tier: faltan 1
select public.campaign_offer('<campaign_id>', 3);   -- tier: 45% OFF

-- ¿y un sábado a las 21?
select public.campaign_offer('<campaign_id>', 3, '2026-09-12 21:00-03');
-- ok:false, reasons: ["No aplica este día de la semana","Aplica hasta las 19:00"]
```
