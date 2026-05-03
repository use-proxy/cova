const { RuleTester } = require("eslint");
const rule = require("../no-unsafe-console");

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
});

tester.run("no-unsafe-console", rule, {
  valid: [
    { code: 'console.log("hello world");' },
    { code: 'import { redactLogPayload } from "@/lib/log/redact"; console.error(redactLogPayload(err));' },
    { code: 'console.warn(redactLogPayload({ user, body }));' },
  ],
  invalid: [
    { code: "console.log(err);", errors: 1 },
    { code: "console.error({ user });", errors: 1 },
    { code: "const o = {a:1}; console.warn(o);", errors: 1 },
    { code: "console.info(`x=${err}`);", errors: 1 },
  ],
});
