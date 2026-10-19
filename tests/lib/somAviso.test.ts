import { describe, expect, it } from 'vitest'
import { realcar, SATURACAO } from '../../src/lib/somAviso'

const rms = (c: Float32Array) => Math.sqrt(c.reduce((s, x) => s + x * x, 0) / c.length)
const pico = (c: Float32Array) => c.reduce((m, x) => Math.max(m, Math.abs(x)), 0)

/** Fala de mentira: silêncio, um seno baixo (pico 0,2) e silêncio. */
function gravacao(): Float32Array {
  const c = new Float32Array(3000)
  for (let i = 1000; i < 2000; i++) c[i] = 0.2 * Math.sin(i / 5)
  return c
}

describe('realcar', () => {
  it('leva o pico ao máximo, sem passar dele', () => {
    for (const s of Object.values(SATURACAO)) {
      const p = pico(realcar([gravacao()], s)[0])
      expect(p).toBeGreaterThan(0.97)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('quanto mais forte, mais alto o volume médio', () => {
    const [normal] = realcar([gravacao()], SATURACAO.normal)
    const [forte] = realcar([gravacao()], SATURACAO.forte)
    const [maximo] = realcar([gravacao()], SATURACAO.maximo)
    expect(rms(forte)).toBeGreaterThan(rms(normal) * 1.2)
    expect(rms(maximo)).toBeGreaterThan(rms(forte))
  })

  it('corta o silêncio do começo e do fim', () => {
    const [c] = realcar([gravacao()], SATURACAO.forte)
    expect(c.length).toBeLessThanOrEqual(1000)
    expect(c.length).toBeGreaterThan(950)
  })

  it('gravação muda volta igual', () => {
    const [c] = realcar([new Float32Array(10)], SATURACAO.maximo)
    expect(Array.from(c)).toEqual(new Array(10).fill(0))
  })
})
