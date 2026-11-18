# Data

`presetShapeDefinitions.xml` is the preset shape definitions file from the Office Open XML standard (ECMA-376, Ecma International), as distributed in the MIT-licensed `modern-openxml` package. `scripts/embed-presets.mjs` turns it into `src/presets-data.ts`. The published file is missing `upArrow` (it lists `upDownArrow` twice); the script adds it from the standard's definition.
