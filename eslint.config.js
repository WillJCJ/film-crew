import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/site/assets/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ["src/worker.js", "eleventy.config.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
