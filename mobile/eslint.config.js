// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/**", "ios/**", "android/**", ".expo/**"],
    // Metro and tsc validate platform imports. Export-introspection rules stall
    // on React Native's mixed native/type-only entrypoints in this toolchain.
    rules: {
      "import/no-unresolved": "off",
      "import/export": "off",
      "import/no-duplicates": "off",
      "import/no-named-as-default": "off",
      "import/no-named-as-default-member": "off",
      "import/namespace": "off",
      "import/named": "off",
    },
  },
]);
