// apps/web/eslint-rules/no-unsafe-console.js
// Flags console.{error,log,warn,info,debug} calls whose arguments contain
// any Identifier or ObjectExpression NOT wrapped in `redactLogPayload(...)`.
// Allows literal strings + template literals with no interpolations.

module.exports = {
  meta: {
    type: "problem",
    docs: { description: "console.* of objects must use redactLogPayload" },
    schema: [],
    messages: {
      unsafe: "console.{{method}} called with potentially sensitive value at argument {{idx}}; wrap in redactLogPayload(...)",
    },
  },
  create(context) {
    const isLogMethod = (callee) =>
      callee &&
      callee.type === "MemberExpression" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "console" &&
      callee.property?.type === "Identifier" &&
      ["error", "log", "warn", "info", "debug"].includes(callee.property.name);

    const isWrappedInRedact = (arg) =>
      arg.type === "CallExpression" &&
      ((arg.callee.type === "Identifier" && arg.callee.name === "redactLogPayload") ||
        (arg.callee.type === "MemberExpression" &&
          arg.callee.property?.type === "Identifier" &&
          arg.callee.property.name === "redactLogPayload"));

    const isSafe = (arg) => {
      if (arg.type === "Literal") return true;
      if (arg.type === "TemplateLiteral" && arg.expressions.length === 0) return true;
      if (isWrappedInRedact(arg)) return true;
      return false;
    };

    return {
      CallExpression(node) {
        if (!isLogMethod(node.callee)) return;
        node.arguments.forEach((arg, idx) => {
          if (isSafe(arg)) return;
          if (arg.type === "Identifier" || arg.type === "ObjectExpression" || arg.type === "ArrayExpression" || arg.type === "MemberExpression" || arg.type === "TemplateLiteral") {
            context.report({
              node: arg,
              messageId: "unsafe",
              data: { method: node.callee.property.name, idx: String(idx) },
            });
          }
        });
      },
    };
  },
};
