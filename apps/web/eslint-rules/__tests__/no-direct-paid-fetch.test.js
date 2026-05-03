const { RuleTester } = require("eslint");
const rule = require("../no-direct-paid-fetch");

const tester = new RuleTester({ parserOptions: { ecmaVersion: 2022, sourceType: "module" } });

tester.run("no-direct-paid-fetch", rule, {
  valid: [
    { code: 'fetch("https://example.com");' },
    { code: 'fetch(url);' },
  ],
  invalid: [
    { code: 'fetch("https://api.anthropic.com/v1/messages");', errors: 1 },
    { code: 'fetch(`https://fal.run/foo`);', errors: 1 },
    { code: 'fetch("https://api.resend.com/emails");', errors: 1 },
  ],
});
