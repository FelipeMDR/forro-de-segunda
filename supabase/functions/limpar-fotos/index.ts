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
  const auth = req.headers.get('Authorization')
  if (!auth) {
    return new Response(
      'Falta o cabeçalho Authorization: Bearer <service_role_key>',
      { status: 401 },
    )
  }
  const token = auth.replace(/^Bearer\s+/i, '').trim()

  // Quem autoriza é o Postgres, não uma comparação de string aqui: as
  // funções de limpeza têm `grant execute` só para service_role, e o
  // PostgREST confere a assinatura do token para decidir o papel. Assim
  // vale qualquer formato de chave, e rotacionar a chave não quebra nada
  // — chamada com a anon morre no "permission denied" do banco.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, token)
  const simular = new URL(req.url).searchParams.get('simular') === '1'

  // Simulação usa a consulta somente-leitura: nada é marcado como
  // arquivado, então dá para rodar à vontade antes de confiar no cron.
  const { data, error } = simular
    ? await supabase.rpc('fotos_orfas')
    : await supabase.rpc('preparar_limpeza_fotos')
  if (error) {
    // "permission denied" = chamou com a anon/publishable em vez da
    // service_role. É erro de quem chamou, não do servidor.
    const semPermissao = /permission denied|must be owner/i.test(error.message)
    return new Response(
      semPermissao
        ? 'Essa chave não tem permissão para a limpeza. Use a service_role ' +
            '(Settings > API Keys, a marcada como secret).'
        : error.message,
      { status: semPermissao ? 403 : 500 },
    )
  }

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
