// Edge Function: limpeza de fotos do bucket.
//
// Existe porque o Postgres não consegue mais apagar arquivo: o Supabase
// bloqueia `delete from storage.objects` por trigger, e a Storage API é
// HTTP. Então o banco decide o que sai (preparar_limpeza_fotos) e esta
// função executa.
//
// Apaga:
//   - fotos de check-ins com mais de 4 meses (mantém a presença no
//     ranking e no histórico; favoritos são poupados)
//   - órfãos: arquivos que nenhum check-in nem perfil referencia
//
// Publicar:  npx supabase functions deploy limpar-fotos
// Agendar:   ver supabase/migracoes/006-limpeza-automatica.sql
//
// Chamada com ?simular=1 não apaga nada — só relata o que sairia.

import { createClient } from 'npm:@supabase/supabase-js@2'

/** A Storage API aceita listas grandes, mas em lotes o erro fica isolado. */
const LOTE = 100

Deno.serve(async (req) => {
  // Só aceita chamadas autenticadas com a service role key
  const auth = req.headers.get('Authorization') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (auth !== `Bearer ${serviceKey}`) {
    return new Response('Não autorizado', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
  const simular = new URL(req.url).searchParams.get('simular') === '1'

  // Simulação usa a consulta somente-leitura: nada é marcado como
  // arquivado, então dá para rodar à vontade antes de confiar no cron.
  const { data, error } = simular
    ? await supabase.rpc('fotos_orfas')
    : await supabase.rpc('preparar_limpeza_fotos')
  if (error) return new Response(error.message, { status: 500 })

  const caminhos = ((data ?? []) as Array<{ caminho: string }>)
    .map((r) => r.caminho)
    .filter(Boolean)

  if (simular) {
    return Response.json({ simulacao: true, sairiam: caminhos.length, caminhos })
  }

  let apagados = 0
  const falhas: string[] = []
  for (let i = 0; i < caminhos.length; i += LOTE) {
    const lote = caminhos.slice(i, i + LOTE)
    const { error: erroRemove } = await supabase.storage
      .from('fotos')
      .remove(lote)
    if (erroRemove) {
      // O arquivo continua órfão e sai na próxima rodada — por isso dá
      // para seguir com os outros lotes em vez de abortar tudo.
      console.error('[limpar-fotos] lote falhou:', erroRemove.message)
      falhas.push(...lote)
    } else {
      apagados += lote.length
    }
  }

  console.log(`[limpar-fotos] ${apagados} apagados, ${falhas.length} falhas`)
  return Response.json({ apagados, falhas: falhas.length })
})
