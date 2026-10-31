import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/worker/test/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    pool: 'forks',
    // Os testes de integração dividem um banco só e alguns criam/apagam produtos temporários (release-gate);
    // em paralelo, um createProject de outro arquivo quebrava na FK project_steps_step_key_fkey.
    fileParallelism: false,
  },
})
