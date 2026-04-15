# Pipeline Quality Tests

This folder holds test iPhone photos and pipeline validation tooling for the Cova v3 render pipeline.

## Test Photo Requirements

- **Diversity:** Include at least one of each: dark room, cluttered room, well-lit room, small room, open-plan room
- **Format:** JPEG or PNG, minimum 1024px wide
- **Upload:** Add to Supabase Storage under `room-videos/tests/quality/inputs/`

## Scoring Rubric

Each output is scored manually against CollovAI baseline on four dimensions (1–5 each):

| Dimension | 1 (Poor) | 3 (Acceptable) | 5 (Excellent) |
|-----------|----------|----------------|---------------|
| `structural_fidelity` | Walls/windows moved or distorted | Layout mostly preserved | Layout pixel-perfect, geometry intact |
| `design_quality` | No coherent style | Partial style match | Fully styled, 60-30-10 color rule visible |
| `lighting_realism` | Flat or blown out | Reasonable lighting | Lighting consistent with room geometry |
| `furniture_plausibility` | Items floating or clipping | Items plausible but imprecise | Items correctly proportioned and placed |

**Minimum passing score:** 3.5 average across all four dimensions.

## Running Tests

```bash
cd /Users/daksh/Desktop/cova
modal run tests/quality/test_runner.py --image-urls "url1,url2"
```

Outputs are saved to Supabase Storage under `room-videos/tests/quality/outputs/`.
Review URLs are printed at the end of the run.

## Comparing Against CollovAI

1. Upload the same input photo to CollovAI
2. Request the same style from CollovAI
3. Score both outputs on the rubric above
4. Cova target: match or exceed CollovAI on structural_fidelity + design_quality
