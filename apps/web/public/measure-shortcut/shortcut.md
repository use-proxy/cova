# Cova Room Measure Shortcut

## What it does

1. Opens Apple Measure app
2. Prompts user to measure room length, width, and ceiling height
3. Opens Cova at step-4 with dimensions pre-filled

## Distribution

Share via iCloud link: https://www.icloud.com/shortcuts/[TO-BE-ADDED]

## Deep link format

https://[cova-domain]/design/step-4?length=[ft]&width=[ft]&ceiling=[ft]&source=shortcut

## Manual shortcut steps (for recreation)

1. Action: "Open App" → Apple Measure
2. Action: "Show Alert" → "Measure your room length (longest wall), then tap Done"
3. Action: "Ask for Input" → Number → "Room length in feet" → store as 'length'
4. Action: "Show Alert" → "Now measure the width (shorter wall), then tap Done"
5. Action: "Ask for Input" → Number → "Room width in feet" → store as 'width'
6. Action: "Show Alert" → "Finally, measure ceiling height (optional), then tap Done"
7. Action: "Ask for Input" → Number → "Ceiling height in feet (skip to use 8ft default)" → store as 'ceiling'
8. Action: "Open URLs" → https://[cova-domain]/design/step-4?length=[length]&width=[width]&ceiling=[ceiling]&source=shortcut
