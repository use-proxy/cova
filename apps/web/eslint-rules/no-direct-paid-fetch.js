// Forbids fetch() calls with literal URLs targeting paid providers.
// Exempts the wrapper file itself.

const FORBIDDEN_HOSTS = ["api.anthropic.com", "fal.run", "modal.run", "searchapi.io", "api.resend.com"];

module.exports = {
  meta: {
    type: "problem",
    docs: { description: "paid provider fetch() must go through paidCall()" },
    schema: [],
    messages: { direct: "fetch('{{host}}') outside lib/paid/call.ts; use paidCall()." },
  },
  create(context) {
    const filename = context.getFilename();
    if (filename.includes("apps/web/lib/paid/call.ts")) return {};

    const isForbiddenUrl = (s) => FORBIDDEN_HOSTS.some((h) => s.includes(h));
    const checkArg = (arg, node) => {
      if (!arg) return;
      if (arg.type === "Literal" && typeof arg.value === "string" && isForbiddenUrl(arg.value)) {
        const matched = FORBIDDEN_HOSTS.find((h) => arg.value.includes(h));
        context.report({ node, messageId: "direct", data: { host: matched } });
      } else if (arg.type === "TemplateLiteral") {
        const merged = arg.quasis.map((q) => q.value.cooked ?? "").join("");
        if (isForbiddenUrl(merged)) {
          const matched = FORBIDDEN_HOSTS.find((h) => merged.includes(h));
          context.report({ node, messageId: "direct", data: { host: matched } });
        }
      }
    };

    return {
      CallExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "fetch") {
          checkArg(node.arguments[0], node);
        }
      },
    };
  },
};
