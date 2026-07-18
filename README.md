# Label Lens

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

## Local development

```bash
npm install
npm run build
npm run lint
npm run dev
```

`npm install` and `npm run build` both copy the local Tesseract assets through `scripts/copy-tesseract-assets.mjs`.

## Links

- Live prototype: https://rektsr0.github.io/treasury-takehome/
- Source repository: https://github.com/rektsr0/treasury-takehome
