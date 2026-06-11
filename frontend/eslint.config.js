// 📦 eslint.config.js — Escola da Saúde
// Configuração institucional para React + Vite + Acessibilidade.

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: [
      "**/node_modules/**",

      "**/dist/**",
      "**/dist-ssr/**",
      "**/build/**",
      "**/.vite/**",
      "**/.next/**",
      "**/out/**",

      "**/coverage/**",
      "**/.nyc_output/**",
      "**/.vitest/**",

      "**/.yarn/**",
      "**/.turbo/**",
      "**/.cache/**",
      "**/.parcel-cache/**",

      "**/cypress/videos/**",
      "**/cypress/screenshots/**",
      "**/playwright-report/**",
      "**/test-results/**",

      "**/uploads/**",
      "**/certificados/**",
      "**/storage/**",
      "**/backups/**",
      "**/data/**",

      "**/.vercel/**",
      "**/.render/**",
      "**/.neon/**",
    ],
  },

  js.configs.recommended,

  {
    files: ["src/**/*.{js,jsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...(globals.es2024 || globals.es2021),
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },

    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },

    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/jsx-uses-react": "off",
      "react/jsx-uses-vars": "error",

      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "all"],
      "no-duplicate-imports": "error",

      "no-alert": "error",
      "no-debugger": "error",
      "no-useless-catch": "error",
      "no-return-await": "error",
      "no-else-return": ["warn", { allowElseIf: false }],
      "object-shorthand": ["warn", "always"],

      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      "no-console": [
        "warn",
        {
          allow: ["warn", "error"],
        },
      ],

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],

      "jsx-a11y/alt-text": "warn",
      "jsx-a11y/aria-role": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/no-autofocus": "off",

      "no-trailing-spaces": "warn",
      "eol-last": ["warn", "always"],
    },
  },

  {
    files: ["src/**/*.{test,spec}.{js,jsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.jest,
        vi: true,
        describe: true,
        it: true,
        test: true,
        expect: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: true,
        afterAll: true,
      },
    },

    rules: {
      "no-console": "off",
    },
  },

  {
    files: [
      "eslint.config.js",
      "vite.config.{js,mjs}",
      "postcss.config.{js,mjs}",
      "tailwind.config.{js,mjs}",
      "scripts/**/*.{js,mjs}",
    ],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },

    rules: {
      "no-console": "off",
    },
  },

  {
    files: ["*.config.cjs", "scripts/**/*.cjs"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },

    rules: {
      "no-console": "off",
    },
  },
];
