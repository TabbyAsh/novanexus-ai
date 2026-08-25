module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "no-console": "off",
  },
  ignorePatterns: ["node_modules/", "dist/", ".next/"],
  overrides: [
    {
      files: [
        "**/__tests__/**/*.{js,jsx,ts,tsx}",
        "**/*.{test,spec}.{js,jsx,ts,tsx}",
      ],
      env: { jest: true },
    },
    {
      files: ["**/*.{ts,tsx}"],
      rules: {
        // TypeScript resolves identifiers and ambient types more accurately than
        // ESLint's JavaScript-only no-undef rule (for example RequestInit).
        "no-undef": "off",
      },
    },
    {
      files: ["apps/web/**/*.{ts,tsx}", "apps/admin/**/*.{ts,tsx}"],
      env: { browser: true, es2022: true },
      plugins: ["@next/next"],
      rules: {
        // With Next.js automatic JSX runtime, React import is not required
        "no-undef": "off",
        // Next.js core web vitals rules
        "@next/next/no-html-link-for-pages": "warn",
        "@next/next/no-img-element": "warn",
      },
    },
  ],
};
