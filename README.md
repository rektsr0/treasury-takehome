# Label Lens

[![Quality checks](https://github.com/rektsr0/treasury-takehome/actions/workflows/quality.yml/badge.svg)](https://github.com/rektsr0/treasury-takehome/actions/workflows/quality.yml)

Take-home project for Treasury RGB.

This app checks alcohol label images against application fields using local OCR. It supports a batch queue, shows the extracted text, and flags missing or mismatched fields before manual review.

## Included

- Sample queue with three preloaded records
- Single-image and multi-image upload
- OCR with `tesseract.js`
- Checks for brand name, class/type, alcohol content, net contents, producer, country of origin, and government warning text
- Per-record review details with pass, attention, and manual review states

## Notes

- The first load starts the OCR worker and caches its assets in the browser.
- Warning text formatting still needs a visual check even when the text is detected correctly.
- One of the sample records has mismatched values so the attention state is easy to verify.

## Approach

The prototype keeps the workflow close to how a compliance reviewer already works. Each record includes the application fields alongside a label image, and the app runs OCR locally in the browser to extract text from that image. The extracted text is then compared against the application values, with the result surfaced as pass, attention, or manual review.

The comparison logic is intentionally strict for fields that should match exactly, but it allows small OCR-related variations where that helps reduce false failures. For example, case and punctuation differences in brand names are normalized before comparison, while the government warning still requires exact wording and an uppercase heading.

Batch handling is built into the queue so a reviewer can load multiple labels at once and work through them in a single screen instead of repeating the same upload flow one file at a time.

## Tools used

- React + TypeScript for the UI and application logic
- Vite for local development and static production builds
- `tesseract.js` for browser-based OCR
- `pytest` for verification tests around build output, matching logic, and obvious secret checks
- Docker + Nginx for a simple containerized deployment path

## Assumptions

- This is a standalone prototype and does not need direct integration with COLA or other internal systems.
- Reviewers still make the final decision, especially for formatting requirements and borderline OCR results.
- Running OCR locally is preferable for this exercise because it avoids external API dependencies and fits the network constraints described in the prompt.
- The prototype is optimized for common label fields shared across many alcohol beverage labels rather than every beverage-specific edge case in TTB rules.

## Trade-offs and limitations

- The prototype focuses on field matching and review workflow rather than full regulatory coverage for every beverage category.
- Warning statement formatting is only partially automated. The app can detect the text and heading case, but boldness, placement, and other visual presentation details still need human review.
- OCR quality depends on the source image. Clear, front-facing labels work best; glare, skew, and low-resolution images can still require manual review.
- The first OCR run may feel slower because the worker and language assets need to initialize before later checks become faster.

## Local development

```bash
npm install
npm run build
npm run lint
npm run dev
```

`npm install` and `npm run build` both copy the local Tesseract assets through `scripts/copy-tesseract-assets.mjs`.

## Verification

```bash
npm run lint
npm run build
python -m pytest -q
```

The pytest suite covers field matching, warning-heading enforcement, alcohol mismatches, deployable asset paths, and obvious committed secret patterns.

## Docker

Build and run:

```bash
docker build -t label-lens .
docker run --rm -p 8080:8080 label-lens
```

Then open `http://localhost:8080`.

## Links

- Live prototype: https://rektsr0.github.io/treasury-takehome/
- Source repository: https://github.com/rektsr0/treasury-takehome
