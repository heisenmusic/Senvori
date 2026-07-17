export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "api",
        "dashboard",
        "site",
        "contracts",
        "ui",
        "i18n",
        "sdk",
        "infra",
        "docs",
        "deps",
        "repo",
        "player",
      ],
    ],
  },
};
