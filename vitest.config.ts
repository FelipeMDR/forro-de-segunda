import { defineConfig } from 'vitest/config'

// Arquivo próprio para os testes não carregarem o vite.config.ts, que
// liga o plugin do PWA e gera service worker a cada execução.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // O PGlite sobe um Postgres inteiro em memória por teste
    testTimeout: 30_000,
  },
})
