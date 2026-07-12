---
name: HEIC/HEIF image upload support
description: How iPhone HEIC photos are made uploadable across the app's image-upload entry points.
---

Browsers can't natively decode `.heic`/`.heif` (default iPhone photo format) — `<img>`/canvas/FileReader all fail silently or show a broken image. Added `src/lib/imageUpload.ts` with `ensureBrowserSupportedImage(file)` (dynamic-imports `heic2any` client-side, converts to a JPEG `File`) and `isImageFile(file)` (accepts HEIC by extension/MIME in addition to `image/*`). Wired into every `<input type="file">` that accepts images: Image Solver and Summarizer (grep `type="file"` in `src/routes` to find all current entry points if adding a new upload feature).

**Why:** `heic2any` is a plain browser/CJS package (unlike the ESM-only KaTeX-family packages that crash this Vite setup — see esm-packages-vite.md); it optimized into Vite's dep bundler cleanly with no crash.

**How to apply:** Any new image-upload UI should call `ensureBrowserSupportedImage` before reading the file (FileReader/base64/etc.), and use `isImageFile` instead of a raw `file.type.startsWith("image/")` check, plus add `.heic,.heif` to the `accept` attribute.
