---
name: Print/PDF export full-width fix
description: Why a print-preview PDF export can render half-width even though the on-screen page looks fine.
---

When a page uses a centered `max-width` (e.g. `780px`) for on-screen readability and then triggers the browser print dialog (`window.print()` in a popup) to "export as PDF", the print stylesheet must explicitly override that width — otherwise the printed/PDF output inherits the screen's narrow centered column and looks like it's using half the page.

**Why:** `@media print` rules don't automatically relax screen-only layout constraints; if you don't add `max-width: none; width: 100%` (plus adjusted `@page` margins) inside `@media print`, the print renderer just reuses the screen CSS.

**How to apply:** Any print/PDF export feature needs its own `@media print { ... }` block that resets width/max-width to full and tunes `@page` margins — don't assume screen-preview CSS is print-safe by default.
