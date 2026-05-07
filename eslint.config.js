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
    files: ["src/worker.js", "src/lib/**/*.js", "src/handlers/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker
      }
    }
  },
  {
    files: ["bot/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker
      }
    }
  },
  {
    files: ["eleventy.config.js", "worker/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
