// ============================================================
// Pintó — Envío de push por FCM HTTP v1
//
// Vacía public.notification_queue y manda cada notificación a todos
// los dispositivos registrados del destinatario.
//
// Secrets que hay que cargar (Supabase Dashboard > Edge Functions > Secrets):
//   FCM_SERVICE_ACCOUNT  → el JSON completo de la cuenta de servicio de
//                          Firebase (Configuración del proyecto > Cuentas
//                          de servicio > Generar nueva clave privada)
//   SUPABASE_URL         → ya viene inyectado
//   SUPABASE_SERVICE_ROLE_KEY → ya viene inyectado
//
// Despliegue:
//   supabase functions deploy send-push
//
// Programación (SQL Editor, requiere pg_cron + pg_net):
//   select cron.schedule('send-push', '* * * * *', $$
//     select net.http_post(
//       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
//       headers := jsonb_build_object(
//         'Content-Type','application/json',
//         'Authorization','Bearer <SERVICE_ROLE_KEY>')
//     );
//   $$);
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATCH_SIZE = 100;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

// --- OAuth2 para FCM HTTP v1 -------------------------------------------

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  // El token de Google dura 1 h; se reutiliza mientras la instancia siga viva.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  ));

  const jwt = `${header}.${claims}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth de Google falló (${res.status}): ${await res.text()}`);
  }

  const json = await res.json();
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

// --- Envío -------------------------------------------------------------

interface SendResult { ok: boolean; invalidToken: boolean; error?: string }

async function sendToToken(
  accessToken: string,
  projectId: string,
  token: string,
  notif: { title: string; body: string; route: string | null; data: Record<string, unknown> },
): Promise<SendResult> {
  // Todos los valores de `data` en FCM tienen que ser strings.
  const data: Record<string, string> = { route: notif.route ?? '' };
  for (const [k, v] of Object.entries(notif.data ?? {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: notif.title, body: notif.body },
          data,
          android: {
            priority: 'HIGH',
            notification: {
              // Tiene que coincidir con el canal creado en MainActivity
              channel_id: 'pinto_default',
              icon: 'ic_stat_pinto',
              color: '#FF6B4A',
              default_sound: true,
            },
          },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        },
      }),
    },
  );

  if (res.ok) return { ok: true, invalidToken: false };

  const text = await res.text();
  // UNREGISTERED / INVALID_ARGUMENT sobre el token = el aparato ya no existe
  const invalidToken =
    res.status === 404 ||
    text.includes('UNREGISTERED') ||
    text.includes('registration-token-not-registered');

  return { ok: false, invalidToken, error: `${res.status}: ${text.slice(0, 300)}` };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const serviceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!serviceAccountRaw) {
    return Response.json({ error: 'Falta el secret FCM_SERVICE_ACCOUNT' }, { status: 500 });
  }

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(serviceAccountRaw);
  } catch {
    return Response.json({ error: 'FCM_SERVICE_ACCOUNT no es un JSON válido' }, { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: pending, error: queueErr } = await supabase
    .from('notification_queue')
    .select('id, user_id, title, body, route, data')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (queueErr) {
    return Response.json({ error: queueErr.message }, { status: 500 });
  }
  if (!pending?.length) {
    return Response.json({ processed: 0 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))];
  const { data: tokenRows } = await supabase
    .from('device_tokens')
    .select('user_id, token')
    .in('user_id', userIds);

  const tokensByUser = new Map<string, string[]>();
  for (const row of tokenRows ?? []) {
    const list = tokensByUser.get(row.user_id) ?? [];
    list.push(row.token);
    tokensByUser.set(row.user_id, list);
  }

  const deadTokens: string[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const notif of pending) {
    const tokens = tokensByUser.get(notif.user_id) ?? [];

    if (tokens.length === 0) {
      // Sin dispositivos registrados: no es un error, simplemente no hay a quién mandarle
      await supabase.from('notification_queue')
        .update({ status: 'skipped', sent_at: new Date().toISOString() })
        .eq('id', notif.id);
      skipped++;
      continue;
    }

    const results = await Promise.all(
      tokens.map((t) => sendToToken(accessToken, sa.project_id, t, notif)),
    );

    results.forEach((r, i) => { if (r.invalidToken) deadTokens.push(tokens[i]); });

    const anyOk = results.some((r) => r.ok);
    await supabase.from('notification_queue')
      .update({
        status: anyOk ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
        error: anyOk ? null : results.map((r) => r.error).filter(Boolean).join(' | ').slice(0, 500),
      })
      .eq('id', notif.id);

    if (anyOk) sent++; else failed++;
  }

  // Limpiar tokens de aparatos que ya desinstalaron la app
  if (deadTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('token', [...new Set(deadTokens)]);
  }

  return Response.json({ processed: pending.length, sent, skipped, failed, pruned: deadTokens.length });
});
