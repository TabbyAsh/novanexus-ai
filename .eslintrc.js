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
  ignorePatterns: ['node_modules/', 'dist/', '.next/'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {},
    },
    {
      files: ['apps/web/**/*.{ts,tsx}'],
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
