import { readFileSync, writeFileSync } from 'fs';
const path = './apps/web/lib/store/fingerprint.ts';
let src = readFileSync(path, 'utf8');

const before = `      partialize: (state) => ({
        roomType: state.roomType,
        budgetTier: state.budgetTier,
        budgetRange: state.budgetRange,
        isGiftMode: state.isGiftMode,
        phaseASelections: state.phaseASelections,
        gridSelections: state.gridSelections,
        phaseBResponses: state.phaseBResponses,
        fingerprint: state.fingerprint,
        styleName: state.styleName,
        styleTags: state.styleTags,
        styleExplanation: state.styleExplanation,
        showcasePredictionIds: state.showcasePredictionIds,
        inclusions: state.inclusions,
        constraints: state.constraints,
        roomDimension: state.roomDimension,
        tiebreakerDeltas: state.tiebreakerDeltas,
      }),`;

const after = `      partialize: (state) => ({
        roomType: state.roomType,
        budgetTier: state.budgetTier,
        budgetRange: state.budgetRange,
        isGiftMode: state.isGiftMode,
        phaseASelections: state.phaseASelections,
        gridSelections: state.gridSelections.map(s => ({
          styleIndex: s.styleIndex,
          round: s.round,
          styleName: '',
        })),
        // phaseBResponses: omitted — transient, rebuilt each session
        fingerprint: state.fingerprint ? {
          ...state.fingerprint,
          covariance: undefined,
        } : null,
        styleName: state.styleName,
        styleTags: state.styleTags,
        styleExplanation: state.styleExplanation,
        // showcasePredictionIds: omitted — not needed in quiz flow
        inclusions: state.inclusions,
        constraints: state.constraints,
        roomDimension: state.roomDimension,
        // tiebreakerDeltas: omitted — in-session only, step-2 is single page load
      }),`;

if (!src.includes(before)) { console.log('NOT FOUND — check whitespace'); process.exit(1); }
writeFileSync(path, src.replace(before, after));
console.log('Done');
