const baseRules = {
	// https://eslint.org/docs/rules/no-tabs
	"no-tabs": "off",

	// https://eslint.org/docs/rules/indent
	indent: "off",

	// https://eslint.org/docs/rules/operator-linebreak
	"operator-linebreak": "off",

	// https://eslint.org/docs/rules/arrow-parens
	"arrow-parens": "off",

	// https://eslint.org/docs/rules/max-len
	"max-len": ["error", { code: 120, ignoreUrls: true }],

	// https://eslint.org/docs/rules/no-use-before-define
	"no-use-before-define": "off",

	// https://eslint.org/docs/rules/object-curly-newline
	"object-curly-newline": "off",

	// https://eslint.org/docs/rules/no-mixed-spaces-and-tabs
	"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],

	// https://eslint.org/docs/rules/implicit-arrow-linebreak
	"implicit-arrow-linebreak": "off",

	// https://eslint.org/docs/rules/no-confusing-arrow
	"no-confusing-arrow": "off",

	// https://eslint.org/docs/rules/no-bitwise
	"no-bitwise": ["error", { allow: ["~"] }],

	// https://eslint.org/docs/rules/consistent-return
	"consistent-return": "off",

	// https://eslint.org/docs/rules/no-restricted-globals
	"no-restricted-globals": "off",

	// https://eslint.org/docs/rules/spaced-comment
	// for typescript directives ///<reference path="value">
	"spaced-comment": ["error", "always", { markers: ["/<"] }],

	"lines-between-class-members": "off",

	// https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/prefer-default-export.md
	"import/prefer-default-export": "off",

	// https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/no-dynamic-require.md
	"import/no-dynamic-require": "off",

	// https://eslint.org/docs/rules/global-require
	"global-require": "off",

	// https://eslint.org/docs/rules/no-plusplus
	"no-plusplus": "off",
};

const config = {
	root: true,
	parser: "@typescript-eslint/parser",
	parserOptions: {
		// project: "./tsconfig.json",
	},
	plugins: ["@typescript-eslint", "prettier", "deprecation"],
	extends: ["airbnb", "airbnb/hooks", "prettier"],
	env: {
		browser: true,
		node: true,
		amd: true,
		es6: true,
		jest: true,
	},
	ignorePatterns: ["*.d.ts", "config/**/*.js", ".eslintrc.js"],
	rules: {
		...baseRules,
	},
};

module.exports = config;
