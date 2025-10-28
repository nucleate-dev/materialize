/* eslint-env node */
const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      "react/display-name": "off",
    },
  },
];
