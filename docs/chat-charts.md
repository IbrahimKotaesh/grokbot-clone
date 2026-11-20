# Charts in conversations

Assistant Markdown can include a `fino-chart` fenced block. The client renders it as an SVG chart with selectable values, a legend and an expandable data table. This does not require a paid chart/image API, computer access, external assets or executable code.

```fino-chart
{"type":"bar","title":"Illustrative sales","labels":["January","February"],"series":[{"name":"Revenue","values":[120,180]}],"unit":"USD"}
```

Supported types: `bar`, `line`, `pie`. Labels and values must have equal lengths. Up to 24 categories and 3 series; pies allow one series, at most 12 categories, nonnegative values and a positive sum. Numbers must be finite and within ±1e12. Titles/labels and input size are bounded. Unknown properties are not passed to the renderer. Model output is treated as data, never as JavaScript, HTML or renderer options. Invalid complete JSON shows a recoverable error; partial streaming JSON shows a preparation state.

The system prompt tells providers to use verified/supplied figures and explicitly label illustrative examples. Display validation cannot verify whether the underlying numbers are factually correct.

Chat bubbles use the bot's solid pigment and choose black/white foreground for contrast. Chart surfaces retain the current light/dark theme for readable axes and data.

Tests: `node tests/message-rendering.mjs` exercises all chart types through the actual Markdown renderer, plus malformed/unsafe data and ordinary-code regressions.
