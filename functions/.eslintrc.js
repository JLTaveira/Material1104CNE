/* Firebase .eslintrc.js
 functions/.eslintrc.js
 2026-02-14 - Joao Taveira (jltaveira@gmail.com) */

module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};


/* module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
  },
  overrides: [
    {
      files: ["**/*
	  /* .spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
}; */
