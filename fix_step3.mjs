import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/app/design/step-3/page.tsx';
let src = readFileSync(path, 'utf8');

const before = `        body: JSON.stringify({
          phase_a_selections: store.phaseASelections,
          phase_b_responses: store.phaseBResponses,
          non_visual_responses: nonVisualAnswers,
          room_type: store.roomType ?? "living_room",
          entry_path: "pairs",
        }),`;

const after = `        body: JSON.stringify({
          phase_a_selections: store.phaseASelections,
          grid_selections: store.gridSelections,
          phase_b_responses: store.phaseBResponses,
          non_visual_responses: nonVisualAnswers,
          room_type: store.roomType ?? "living_room",
          tiebreaker_deltas: store.tiebreakerDeltas ?? null,
          entry_path: "pairs",
        }),`;

if (!src.includes(before)) { console.log('NOT FOUND — check whitespace'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
