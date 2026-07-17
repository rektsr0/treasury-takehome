# Label Lens

Prototype submission for the Treasury RGB take-home. `Label Lens` is a browser-based alcohol label review tool that uses local OCR to compare application fields against label text and flag mismatches for human review.

## What it does

- Reviews labels one at a time or in a batch queue.
- Compares brand name, class/type, alcohol content, net contents, producer/bottler, and country of origin against application data.
- Verifies the federal government warning statement and calls out formatting follow-up that still needs a human eye.
- Ships with a three-label demo batch, including one intentionally failing sample to show rejection behavior.
- Runs without external AI or OCR APIs at review time. Tesseract assets are copied locally during install/build.

## Why this approach

The stakeholder notes emphasized a simple workflow, batch support, fast feedback, and a preference for standalone behavior over cloud dependencies. This implementation keeps everything in a static React app:

- The OCR engine runs in-browser with `tesseract.js`.
- Language data and WebAssembly assets are served locally from the app.
- The UX starts with a preloaded queue so reviewers can validate the prototype immediately.
- Checks are deterministic and explain why a label passed, failed, or still needs manual follow-up.

## Tradeoffs

- OCR can confirm text content and uppercase headings, but it cannot reliably certify bold styling or all formatting requirements. Those are surfaced as manual follow-up items.
- The current verification logic is rule-based after OCR extraction. That keeps behavior explainable, but a production system would likely add stronger image preprocessing, layout analysis, and reviewer analytics.
- The prototype assumes standard image uploads. It does not integrate with COLAs Online or external storage systems.

## Local development

```bash
npm install
npm run build
npm run lint
npm run dev
```

`npm install` and `npm run build` both prepare local Tesseract assets automatically through `scripts/copy-tesseract-assets.mjs`.

## Submission artifacts

- Live prototype: pending deployment
- Source repository: pending remote publish
