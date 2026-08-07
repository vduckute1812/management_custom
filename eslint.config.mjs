import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import vueParser from "vue-eslint-parser";

const sourceFiles = ["**/*.{ts,vue}"];

function recommendedRules(configs) {
  const rules = {};
  for (const config of Array.isArray(configs) ? configs : [configs]) {
    Object.assign(rules, config.rules);
  }
  return rules;
}

function warningsOnly(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => {
      if (setting === "off" || setting === 0) return [name, "off"];
      if (Array.isArray(setting)) return [name, ["warn", ...setting.slice(1)]];
      return [name, "warn"];
    }),
  );
}

const coreRecommended = warningsOnly(eslint.configs.recommended.rules);
const typescriptRecommended = warningsOnly(
  recommendedRules(tseslint.configs.recommended),
);
const vueRecommended = warningsOnly(
  recommendedRules(vue.configs["flat/recommended"]),
);

const sharedRules = {
  ...coreRecommended,
  ...typescriptRecommended,
  "no-undef": "off",
  "@typescript-eslint/no-explicit-any": "warn",
};

export default [
  {
    ignores: [
      ".nuxt/**",
      ".output/**",
      "coverage/**",
      "node_modules/**",
      "public/**",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: sharedRules,
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      vue,
    },
    processor: vue.processors.vue,
    rules: {
      ...sharedRules,
      ...vueRecommended,
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: sourceFiles,
    linterOptions: {
      reportUnusedDisableDirectives: "warn",
    },
  },
  // Last: turn off rules that fight Prettier (attribute order, etc.).
  prettier,
];
