const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "package-lock.json"],
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  {
    files: [
      "src/main/**/*.js",
      "src/preload/**/*.js",
      "scripts/**/*.js",
      "test/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly",
        globalThis: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
];
