import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      // products/ tem as regras de cada app; só os apps para computador (Maestro, Relay, Carro do Freela) entram aqui
      // (as mesmas do hub-desktop, abaixo)
      'products/*',
      '!products/maestro/',
      'products/maestro/*',
      '!products/maestro/desktop/',
      'products/maestro/desktop/dist/**',
      '!products/relay/',
      'products/relay/*',
      '!products/relay/desktop/',
      'products/relay/desktop/dist/**',
      '!products/carro-do-freela/',
      'products/carro-do-freela/*',
      '!products/carro-do-freela/desktop/',
      'products/carro-do-freela/desktop/dist/**',
      'apps/hub-desktop/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      'apps/hub-web/next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // App de desktop (Electron): CommonJS no processo principal e scripts de navegador nas páginas locais.
  {
    files: [
      'apps/hub-desktop/desktop/**/*.cjs',
      'products/maestro/desktop/desktop/**/*.cjs',
      'products/maestro/desktop/scripts/**/*.cjs',
      'products/relay/desktop/desktop/**/*.cjs',
      'products/relay/desktop/scripts/**/*.cjs',
      'products/carro-do-freela/desktop/desktop/**/*.cjs',
      'products/carro-do-freela/desktop/scripts/**/*.cjs',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        document: 'readonly',
        addEventListener: 'readonly',
        setInterval: 'readonly',
        setImmediate: 'readonly',
        clearTimeout: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'apps/hub-desktop/desktop/paginas/**/*.js',
      'products/maestro/desktop/desktop/paginas/**/*.js',
      'products/relay/desktop/desktop/paginas/**/*.js',
      'products/carro-do-freela/desktop/desktop/paginas/**/*.js',
    ],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        addEventListener: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
  {
    files: [
      'apps/hub-desktop/scripts/**/*.mjs',
      'apps/hub-desktop/test/**/*.mjs',
      'products/maestro/desktop/scripts/**/*.mjs',
      'products/maestro/desktop/test/**/*.mjs',
      'products/relay/desktop/scripts/**/*.mjs',
      'products/relay/desktop/test/**/*.mjs',
      'products/carro-do-freela/desktop/scripts/**/*.mjs',
      'products/carro-do-freela/desktop/test/**/*.mjs',
    ],
    languageOptions: { globals: { fetch: 'readonly', AbortSignal: 'readonly', setInterval: 'readonly' } },
  },
  // Núcleo do Drive (packages/drive-web): módulos de navegador e o service worker, sem build.
  {
    files: ['packages/drive-web/src/**/*.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        MessageChannel: 'readonly',
        clearTimeout: 'readonly',
        URLSearchParams: 'readonly',
        Intl: 'readonly',
      },
    },
  },
)
