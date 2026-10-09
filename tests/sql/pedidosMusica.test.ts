import { describe, expect, it } from 'vitest'
import { bancoComMigracao, fila, IDS, pedido, pessoa } from './banco'

const NOITE = '2026-10-12'
/** Hora `hh:mm` da noite de 12/10, em São Paulo. */
const as = (hhmm: string) => `2026-10-12T${hhmm}:00-03:00`

async function comTresAlunos() {
  const db = await bancoComMigracao()
  await pessoa(db, IDS.a, 'Ana')
  await pessoa(db, IDS.b, 'Beto')
  await pessoa(db, IDS.c, 'Caio')
  return db
}

describe('fila_da_noite — rodízio', () => {
  it('quem chega com 1 pedido passa na frente da 2ª música de quem pediu 20', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    for (let i = 2; i <= 20; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`))
    }
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:30'))

    const f = await fila(db, NOITE)
    expect(f.slice(0, 3).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a2',
      'spotify:track:a3',
    ])
    expect(f[0]).toMatchObject({ rodada: 1, posicao: 1 })
    expect(f[1]).toMatchObject({ rodada: 2, posicao: 2 })
  })

  it('quem chega depois de A tocar 15 entra na frente da 16ª de A', async () => {
    const db = await comTresAlunos()
    for (let i = 1; i <= 15; i++) {
      await pedido(db, IDS.a, NOITE, `spotify:track:a${i}`, as(`21:${String(i).padStart(2, '0')}`), 'tocou')
    }
    await pedido(db, IDS.a, NOITE, 'spotify:track:a16', as('21:16'))
    await pedido(db, IDS.c, NOITE, 'spotify:track:c1', as('23:00'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:c1',
      'spotify:track:a16',
    ])
  })

  it('mesma rodada: vai na frente quem fez o primeiro pedido da noite antes', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:05'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:10'))

    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual([
      'spotify:track:b1',
      'spotify:track:a1',
      'spotify:track:b2',
    ])
  })

  it('cancelar um pedido reorganiza as rodadas daquela pessoa', async () => {
    const db = await comTresAlunos()
    const a1 = await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'))
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('21:03'))
    await db.query(`update pedidos_musica set status = 'cancelado' where id = $1`, [a1])

    // A agora tem só a2, que vira rodada 1; e a chegada de A passa a ser
    // 21:01 (o cancelado não conta), ainda antes de B
    expect(await fila(db, NOITE)).toEqual([
      { track_uri: 'spotify:track:a2', rodada: 1, posicao: 1 },
      { track_uri: 'spotify:track:b1', rodada: 1, posicao: 2 },
      { track_uri: 'spotify:track:b2', rodada: 2, posicao: 3 },
    ])
  })

  it('quem já tocou 1 e pede outra mais tarde entra na rodada 2', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, NOITE, 'spotify:track:a1', as('21:00'), 'tocou')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a2', as('21:01'), 'enviado')
    await pedido(db, IDS.a, NOITE, 'spotify:track:a3', as('21:02'))
    await pedido(db, IDS.b, NOITE, 'spotify:track:b1', as('21:03'), 'tocou')
    await pedido(db, IDS.b, NOITE, 'spotify:track:b2', as('23:00'))

    // a3 é rodada 3 (2 já enviados + 1); b2 é rodada 2 → b2 primeiro
    expect((await fila(db, NOITE)).map((p) => [p.track_uri, p.rodada])).toEqual([
      ['spotify:track:b2', 2],
      ['spotify:track:a3', 3],
    ])
  })

  it('só olha a noite pedida', async () => {
    const db = await comTresAlunos()
    await pedido(db, IDS.a, '2026-10-11', 'spotify:track:ontem', '2026-10-11T22:00:00-03:00')
    await pedido(db, IDS.a, NOITE, 'spotify:track:hoje', as('22:00'))
    expect((await fila(db, NOITE)).map((p) => p.track_uri)).toEqual(['spotify:track:hoje'])
  })
})
