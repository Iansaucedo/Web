// ESLint de todo el monorepo (API, web, E2E y scripts). Se ejecuta en la CI con `npm run lint`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', 'docs/**', 'e2e-informe/**', 'test-results/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // `_` delante: variable que se descarta a propósito (p. ej. `const { id: _id, ...resto } = x`).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', destructuredArrayIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // La API escribe sus logs en una línea JSON por evento con console.log (lib/log.ts); los scripts imprimen su resultado.
    files: ['apps/api/src/lib/log.ts', 'apps/api/scripts/**', 'start.js', 'prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['start.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    settings: { next: { rootDir: 'apps/web' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Regla de `pages/_document`: con el App Router las fuentes del layout raíz valen para todas las páginas.
      '@next/next/no-page-custom-font': 'off',
    },
  },
);
