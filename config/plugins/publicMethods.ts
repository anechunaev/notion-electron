import type { ESLint } from "eslint";

const plugin: ESLint.Plugin = {
	rules: {
		"public-class-methods-use-this": {
			meta: {
				type: "suggestion",
				docs: {
					description: "Require public class methods to use this",
				},
				schema: [],
				messages: {
					missingThis:
						"Public class method '{{name}}' does not use 'this'.",
				},
			},

			create(context) {
				const methodStack: { node: unknown; usesThis: boolean }[] = [];

				function shouldCheck(node: { kind: string; static: boolean; accessibility?: string; key: { type: string; name: string } }): boolean {
					if (node.kind !== "method") {
						return false;
					}

					if (node.static) {
						return false;
					}

					if (
						node.key.type === "Identifier" &&
						node.key.name === "constructor"
					) {
						return false;
					}

					// JS private method: #foo()
					if (node.key.type === "PrivateIdentifier") {
						return false;
					}

					// TS private foo()
					if (node.accessibility === "private") {
						return false;
					}

					return true;
				}

				function methodName(node: { key: { type: string; name: string } }): string {
					switch (node.key.type) {
						case "Identifier":
							return node.key.name;

						case "PrivateIdentifier":
							return `#${node.key.name}`;

						default:
							return "<computed>";
					}
				}

				return {
					MethodDefinition(node) {
						if (!shouldCheck(node)) {
							return;
						}

						methodStack.push({
							node,
							usesThis: false,
						});
					},

					"MethodDefinition:exit"(node) {
						if (!shouldCheck(node)) {
							return;
						}

						const current = methodStack.pop();

						if (!current?.usesThis) {
							context.report({
								node,
								messageId: "missingThis",
								data: {
									name: methodName(node),
								},
							});
						}
					},

					ThisExpression() {
						const current = methodStack.at(-1);

						if (current) {
							current.usesThis = true;
						}
					},

					Super() {
						const current = methodStack.at(-1);

						if (current) {
							current.usesThis = true;
						}
					},
				};
			},
		},
	},
};

export default plugin;
