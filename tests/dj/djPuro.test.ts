import { describe, expect, it } from 'vitest'
import {
  decidirPassada,
  estadoDoPlayer,
  faixaDaApi,
  fimDaNoite,
  mesclarToken,
  precisaRenovar,
  type EstadoPlayer,
} from '../../supabase/functions/_shared/djPuro'

const faixa = (uri: string) => ({
  uri,
  name: `Música ${uri}`,
  duration_ms: 180000,
  artists: [{ name: 'Dominguinhos' }, { name: 'Gil' }],
  album: { images: [{ url: 'https://capa/1.jpg' }] },
})

describe('faixaDaApi', () => {
  it('converte uma faixa do Spotify', () => {
    expect(faixaDaApi(faixa('spotify:track:x'))).toEqual({
      uri: 'spotify:track:x',
      titulo: 'Música spotify:track:x',
      artista: 'Dominguinhos, Gil',
      capa_url: 'https://capa/1.jpg',
      duracao_ms: 180000,
    })
  })

  it('faixa sem capa não quebra', () => {
    const f = faixaDaApi({ ...faixa('spotify:track:x'), album: { images: [] } })
    expect(f?.capa_url).toBeNull()
  })

  it('episódio de podcast vira item com o nome do programa', () => {
    const f = faixaDaApi({
      uri: 'spotify:episode:e1',
      name: 'Episódio 1',
      duration_ms: 1000,
      show: { name: 'Um podcast' },
      images: [{ url: 'https://capa/e.jpg' }],
    })
    expect(f).toMatchObject({ artista: 'Um podcast', capa_url: 'https://capa/e.jpg' })
  })

  it('sem uri ou sem nome devolve null', () => {
    expect(faixaDaApi(null)).toBeNull()
    expect(faixaDaApi({ name: 'x' })).toBeNull()
    expect(faixaDaApi({ uri: 'spotify:track:x' })).toBeNull()
  })
})

describe('estadoDoPlayer', () => {
  it('sem resposta (204) ou sem música tocando = nenhum aparelho', () => {
    expect(estadoDoPlayer(null)).toBeNull()
    expect(estadoDoPlayer({ currently_playing: null, queue: [] })).toBeNull()
  })

  it('lê o que está tocando e as uris da fila, pulando itens quebrados', () => {
    const e = estadoDoPlayer({
      currently_playing: faixa('spotify:track:agora'),
      queue: [faixa('spotify:track:q1'), { lixo: true }, faixa('spotify:track:q2')],
    })
    expect(e?.tocando.uri).toBe('spotify:track:agora')
    expect(e?.filaUris).toEqual(['spotify:track:q1', 'spotify:track:q2'])
  })
})

describe('tokens', () => {
  const agora = new Date('2026-10-12T22:00:00Z')

  it('guarda a expiração a partir de expires_in', () => {
    const t = mesclarToken(null, { access_token: 'a', refresh_token: 'r', expires_in: 3600 }, agora)
    expect(t).toEqual({ access_token: 'a', refresh_token: 'r', expira_em: '2026-10-12T23:00:00.000Z' })
  })

  it('renovação sem refresh_token novo mantém o antigo', () => {
    const antigo = { access_token: 'a', refresh_token: 'r-velho', expira_em: '2026-10-12T22:00:00.000Z' }
    const t = mesclarToken(antigo, { access_token: 'b', expires_in: 3600 }, agora)
    expect(t.refresh_token).toBe('r-velho')
    expect(t.access_token).toBe('b')
  })

  it('sem refresh_token nenhum é erro', () => {
    expect(() => mesclarToken(null, { access_token: 'a', expires_in: 3600 }, agora)).toThrow()
  })

  it('renova quando falta menos de 1 minuto', () => {
    expect(precisaRenovar('2026-10-12T22:00:59.000Z', agora)).toBe(true)
    expect(precisaRenovar('2026-10-12T22:01:01.000Z', agora)).toBe(false)
    expect(precisaRenovar('2026-10-12T21:00:00.000Z', agora)).toBe(true)
  })
})

describe('fimDaNoite', () => {
  it('é 5h do dia seguinte em São Paulo (8h UTC)', () => {
    expect(fimDaNoite('2026-10-12').toISOString()).toBe('2026-10-13T08:00:00.000Z')
    // virada de mês
    expect(fimDaNoite('2026-10-31').toISOString()).toBe('2026-11-01T08:00:00.000Z')
  })
})

describe('decidirPassada', () => {
  const NOITE = '2026-10-12'
  const agora = new Date('2026-10-13T00:30:00Z') // 21h30 em SP
  const player = (tocando: string, fila: string[] = []): EstadoPlayer => ({
    tocando: faixaDaApi(faixa(tocando))!,
    filaUris: fila,
  })
  const base = {
    agora,
    noite: NOITE,
    temConexao: true,
    player: player('spotify:track:playlist1'),
    enviadoPendente: null,
    temProximo: true,
  }

  it('depois das 5h fecha por virada, antes de olhar qualquer outra coisa', () => {
    expect(
      decidirPassada({ ...base, agora: new Date('2026-10-13T08:00:00Z'), temConexao: false, player: null }),
    ).toEqual({ tipo: 'fechar', motivo: 'virada' })
  })

  it('sem conexão (desconectou ou revogou) fecha por conexão perdida', () => {
    expect(decidirPassada({ ...base, temConexao: false })).toEqual({
      tipo: 'fechar',
      motivo: 'conexao_perdida',
    })
  })

  it('sem aparelho tocando não manda nada', () => {
    expect(decidirPassada({ ...base, player: null })).toEqual({ tipo: 'sem_aparelho' })
  })

  it('sem pedido nosso pendente e com fila: manda o próximo', () => {
    expect(decidirPassada(base)).toEqual({ tipo: 'passada', marcarTocou: null, enviar: true })
  })

  it('sem pedidos esperando: não manda nada', () => {
    expect(decidirPassada({ ...base, temProximo: false })).toEqual({
      tipo: 'passada',
      marcarTocou: null,
      enviar: false,
    })
  })

  it('nosso pedido ainda na fila do Spotify: espera', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:playlist1', ['spotify:track:nosso', 'spotify:track:playlist2']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: null, enviar: false })
  })

  it('nosso pedido tocando: marca tocou e manda o próximo', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:nosso', ['spotify:track:playlist2']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: 'p1', enviar: true })
  })

  it('nosso pedido sumiu (pulado no Spotify): não conta, e manda o próximo', () => {
    expect(
      decidirPassada({
        ...base,
        player: player('spotify:track:playlist3', ['spotify:track:playlist4']),
        enviadoPendente: { id: 'p1', trackUri: 'spotify:track:nosso' },
      }),
    ).toEqual({ tipo: 'passada', marcarTocou: null, enviar: true })
  })
})
