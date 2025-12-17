import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn", // 或 'off' 完全关闭
        {
          varsIgnorePattern: "^_", // 变量名前缀 '_' 的忽略
          argsIgnorePattern: "^_", // 函数参数前缀 '_' 的忽略
        },
      ],
      "@typescript-eslint/no-explicit-any": [
        "warn", // 或 'off' 完全关闭
      ],
      "react-refresh/only-export-components": "off",
    },
  },
]);
