import { beforeEach, describe, expect, it } from 'vitest'
import {
  escreverLembrado,
  esquecerTelas,
  estadoDaChave,
  lembrarTela,
  lerTela,
  proximoValor,
} from '../../src/lib/memoriaTelas'

describe('memória das telas', () => {
  beforeEach(() => esquecerTelas())

  it('devolve o valor inicial quando a tela nunca carregou', () => {
    expect(lerTela('feed', null)).toBeNull()
  })

  it('devolve o último valor guardado ao voltar para a tela', () => {
    lembrarTela('feed', [1, 2, 3])
    expect(lerTela('feed', null)).toEqual([1, 2, 3])
  })

  it('distingue "guardei null" de "nunca guardei"', () => {
    lembrarTela('posicao', null)
    expect(lerTela<number | null>('posicao', 7)).toBeNull()
  })

  it('esquece tudo (troca de conta não pode ver dados da anterior)', () => {
    lembrarTela('feed', [1])
    esquecerTelas()
    expect(lerTela('feed', 'vazio')).toBe('vazio')
  })

  it('aplica atualização em forma de função, como o setState', () => {
    expect(proximoValor<number[]>((a) => [...a, 4], [1, 2, 3])).toEqual([1, 2, 3, 4])
    expect(proximoValor(5, 1)).toBe(5)
  })

  it('troca de chave mostra o guardado da chave nova, não o da antiga', () => {
    lembrarTela('perfil:B', 'dados de B')
    expect(estadoDaChave('perfil:A', null)).toEqual({ chave: 'perfil:A', valor: null })
    expect(estadoDaChave('perfil:B', null)).toEqual({ chave: 'perfil:B', valor: 'dados de B' })
  })

  it('escrita da chave à mostra atualiza o estado e a memória', () => {
    const e = escreverLembrado(estadoDaChave<number[]>('lista', []), 'lista', (a) => [...a, 1])
    expect(e).toEqual({ chave: 'lista', valor: [1] })
    expect(lerTela('lista', null)).toEqual([1])
  })

  it('resposta atrasada de outra chave não mexe na tela, só na memória dela', () => {
    const naTela = estadoDaChave<string | null>('perfil:B', null)
    const depois = escreverLembrado(naTela, 'perfil:A', 'dados de A')
    expect(depois).toBe(naTela)
    expect(lerTela('perfil:A', null)).toBe('dados de A')
  })
})
