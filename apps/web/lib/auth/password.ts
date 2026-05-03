// P01b — zxcvbn-ts password-strength check. Score >= 2 acceptable (locked).

import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";
import * as zxcvbnEn from "@zxcvbn-ts/language-en";

let configured = false;
function configure() {
  if (configured) return;
  zxcvbnOptions.setOptions({
    translations: zxcvbnEn.translations,
    graphs: zxcvbnCommon.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommon.dictionary,
      ...zxcvbnEn.dictionary,
    },
  });
  configured = true;
}

export const PASSWORD_SCORE_MIN = 2;

export interface PasswordCheck {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  warning?: string;
  suggestions: string[];
}

export function checkPasswordStrength(password: string): PasswordCheck {
  configure();
  const r = zxcvbn(password);
  const score = r.score as 0 | 1 | 2 | 3 | 4;
  return {
    ok: score >= PASSWORD_SCORE_MIN,
    score,
    warning: r.feedback.warning ?? undefined,
    suggestions: r.feedback.suggestions ?? [],
  };
}
