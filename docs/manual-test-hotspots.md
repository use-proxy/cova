# Hotspot Camera Tracking — Manual Test Checklist

## Setup
- Open /room/97da4464-ae41-4836-927c-442b5fb24037 on desktop and mobile
- Room must have furniture_matching complete and room_products populated (8 pieces, 24 rows)

## Tests

### Desktop (Chrome/Safari)
- [ ] Hotspots appear on room load at correct horizontal positions
- [ ] Drag camera left/right — hotspots track correctly (move with room)
- [ ] Hotspots behind camera (z <= 0) disappear when you rotate past them
- [ ] Hotspots reappear smoothly when you rotate back
- [ ] Elevation looks correct — rug near bottom (-40°), sofa below center (-20°), ceiling lights near top (+70°), media unit at eye level (+5°)
- [ ] Click hotspot — ProductPanel opens with correct furniture matches
- [ ] Storage cabinets at az=90° and az=270° appear when facing those directions and hide when facing away

### Expected hotspot positions at default camera (facing forward = panorama center):
| Piece | Azimuth | Elevation | Should appear? |
|-------|---------|-----------|----------------|
| gray sectional sofa | 180° | -20° | Yes, center-low |
| round coffee table | 180° | -35° | Yes, center-lower |
| circular area rug | 180° | -40° | Yes, center-lowest |
| gray accent chair | 240° | -18° | Yes, right of center |
| wall-mounted media unit | 200° | +5° | Yes, slightly right, eye level |
| recessed ceiling lights | 180° | +70° | Yes, center-top |
| white storage cabinets left | 90° | 0° | No (behind/far edge) |
| white storage cabinets right | 270° | 0° | No (behind/far edge) |

### Mobile Safari (iPhone)
- [ ] Hotspots appear on room load
- [ ] Touch drag — hotspots track camera rotation correctly
- [ ] Pinch zoom — hotspots stay positioned correctly during zoom
- [ ] Hotspot tap opens ProductPanel
- [ ] No jank or lag between camera movement and hotspot repositioning

### Mobile Chrome (Android)
- [ ] Same tests as Mobile Safari above

### Edge Cases
- [ ] Room with 8 furniture pieces — all 8 hotspots visible when facing correct direction
- [ ] Rotate 360° — hotspots appear and disappear correctly through full rotation
- [ ] Furniture with null elevation_degrees — falls back to -25° without error
- [ ] Rapid camera rotation — hotspots don't flicker or lag noticeably

## Pass Criteria
All desktop tests must pass before shipping.
Mobile tests: hotspot tracking must work on at least one mobile browser.

## Known Limitation
SparkJS 0.1.10 does not expose a camera change callback. Hotspot positions
update via rAF polling at ~60fps. If hotspot tracking feels laggy on mobile,
the rAF loop may be running slower than 60fps — check with Chrome DevTools
Performance tab.
