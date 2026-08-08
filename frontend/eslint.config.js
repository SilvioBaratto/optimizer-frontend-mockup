// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      // Feature/page components use the "app" prefix; the reusable primitives
      // under src/app/shared/ui use "ui" (ui-table, ui-tabs, ui-tooltip).
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: ["app", "ui"],
          style: "kebab-case",
        },
      ],
    },
  },
  {
    // Spec files build throwaway host components and deliberately declare
    // fixtures that individual cases may not all consume. Their selectors are
    // never rendered outside TestBed, so the app/ui prefix rule doesn't apply.
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { args: "none", varsIgnorePattern: "^_" },
      ],
      "@angular-eslint/component-selector": "off",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  }
]);
