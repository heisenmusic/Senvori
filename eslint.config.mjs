import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/drizzle/**",
      "**/test/**",
      "**/next-env.d.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // NestJS API: constructor dependency injection relies on
    // `emitDecoratorMetadata`, which emits the design:paramtypes for injected
    // classes as runtime VALUES. `consistent-type-imports` cannot see that and
    // would rewrite those imports to `import type`, erasing the metadata and
    // breaking DI at runtime. This is why `nest new` does not ship the rule.
    files: ["apps/api/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    // React apps
    files: ["apps/dashboard/**/*.{ts,tsx}", "apps/site/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    plugins: { react },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "19" } },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    // D8: zero hardcoded UI strings — every literal must come from the i18n layer.
    files: ["apps/dashboard/src/**/*.tsx", "apps/site/src/**/*.tsx"],
    plugins: { react },
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }],
    },
  },
  prettier,
);
