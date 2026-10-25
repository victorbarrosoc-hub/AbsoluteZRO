import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'products/**',
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
    files: ['apps/hub-desktop/desktop/**/*.cjs'],
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
    files: ['apps/hub-desktop/desktop/paginas/**/*.js'],
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
    files: ['apps/hub-desktop/scripts/**/*.mjs', 'apps/hub-desktop/test/**/*.mjs'],
    languageOptions: { globals: { fetch: 'readonly', AbortSignal: 'readonly', setInterval: 'readonly' } },
  },
)
