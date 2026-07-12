module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
  },
  // Several legacy tsconfigs still emit JavaScript beside TypeScript sources.
  // Lint the authored TypeScript once; do not lint its generated twin.
  ignorePatterns: ['node_modules/', 'dist/', '.next/', '**/src/**/*.js'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {},
    },
    {
      files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
      env: { jest: true, node: true },
    },
    {
      files: ['apps/web/**/*.{ts,tsx}', 'apps/admin/**/*.{ts,tsx}'],
      env: { browser: true, es2022: true },
      plugins: ['@next/next'],
      rules: {
        // With Next.js automatic JSX runtime, React import is not required
        'no-undef': 'off',
        // Next.js core web vitals rules
        '@next/next/no-html-link-for-pages': 'warn',
        '@next/next/no-img-element': 'warn',
      },
    },
  ],
};
