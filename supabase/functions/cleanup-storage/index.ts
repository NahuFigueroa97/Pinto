// ============================================================
// Pintó — Baja real de archivos en Storage
//
// Borrar de `storage.objects` por SQL saca la fila de metadatos pero NO el
// archivo: los bytes viven en S3 y se siguen facturando todos los meses. La
// baja real hay que pedirla por la API de Storage.
//
// Por eso run_all_cleanups() encola las rutas en storage_cleanup_queue y
// esta función las borra de verdad.
//
// Despliegue:
//   supabase functions deploy cleanup-storage
//
// Programación (después del barrido diario de las 4:00):
//   select cron.schedule('cleanup-storage', '15 4 * * *', $$
//     select net.http_post(
//       url     := (select decrypted_secret from vault.decrypted_secrets
//                   where name = 'edge_function_url_cleanup'),
//       headers := public.push_request_headers()
//     );
//   $$);
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BATCH_SIZE = 200;

interface QueueRow {
  id: string;
  bucket: string;
  path: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: pending, error } = await supabase
    .from('storage_cleanup_queue')
    .select('id, bucket, path')
    .is('deleted_at', null)
    .order('created_at')
    .limit(BATCH_SIZE);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!pending?.length) return Response.json({ deleted: 0, failed: 0 });

  // Agrupar por bucket: la API de Storage borra en lote por bucket
  const byBucket = new Map<string, QueueRow[]>();
  for (const row of pending as QueueRow[]) {
    const list = byBucket.get(row.bucket) ?? [];
    list.push(row);
    byBucket.set(row.bucket, list);
  }

  let deleted = 0;
  let failed = 0;

  for (const [bucket, rows] of byBucket) {
    const { error: rmError } = await supabase.storage
      .from(bucket)
      .remove(rows.map((r) => r.path));

    const now = new Date().toISOString();

    if (rmError) {
      // No se reintenta indefinidamente: se anota el error y se marca, para
      // que una ruta rota no bloquee la cola para siempre.
      failed += rows.length;
      await supabase.from('storage_cleanup_queue')
        .update({ deleted_at: now, error: rmError.message.slice(0, 300) })
        .in('id', rows.map((r) => r.id));
    } else {
      deleted += rows.length;
      await supabase.from('storage_cleanup_queue')
        .update({ deleted_at: now, error: null })
        .in('id', rows.map((r) => r.id));
    }
  }

  // Las filas ya procesadas no hacen falta más allá de una semana
  await supabase.from('storage_cleanup_queue')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', new Date(Date.now() - 7 * 864e5).toISOString());

  return Response.json({ deleted, failed, batch: pending.length });
});
