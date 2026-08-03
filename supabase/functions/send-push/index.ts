// Edge Function: envia o lembrete "Hoje tem forró!" para todos os
// inscritos em push. (Fase 4)
//
// Publicar:   supabase functions deploy send-push
// Secrets:    supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
// Agendar:    Dashboard > Integrations > Cron, toda segunda ~12h:
//             select net.http_post(
//               url := 'https://SEU-PROJETO.supabase.co/functions/v1/send-push',
//               headers := '{"Authorization": "Bearer SEU_SERVICE_ROLE_KEY"}'::jsonb
//             );
// (ou um cron do GitHub Actions chamando a URL da função)

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

Deno.serve(async (req) => {
  // Só aceita chamadas autenticadas com a service role key
  const auth = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response('Não autorizado', { status: 401 })
  }

  webpush.setVapidDetails(
    'mailto:contato@espacolivre.org',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  )

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
  )

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
  if (error) return new Response(error.message, { status: 500 })

  const payload = JSON.stringify({
    title: 'Forró de Segunda 🎶',
    body: 'Hoje tem forró! Não esquece de fazer o check-in com foto.',
    url: '/',
  })

  let enviados = 0
  const invalidos: string[] = []
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(s.subscription, payload)
        enviados++
      } catch (e) {
        // 404/410 = assinatura expirada: remove do banco
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) invalidos.push(s.endpoint)
      }
    }),
  )

  if (invalidos.length > 0) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', invalidos)
  }

  return Response.json({ enviados, removidos: invalidos.length })
})
