---
    name: Popup-window PDF export pitfall
    description: Why window.open()-based print/PDF export broke in this Replit project and the fix
    ---

    ## Rule
    Don't build print-to-PDF export by opening a new popup window (window.open + document.write + window.print() inside the popup). Print the current document instead, isolating just the exportable content with a "hide everything else" print stylesheet.

    **Why:** The popup approach caused two symptoms that looked unrelated but shared one root cause: intermittently blocked/misbehaving popups (especially inside Replit's iframe-proxied preview, and on some mobile browsers) meant "Download PDF" sometimes silently failed, and when the popup did open, print-media CSS cascade issues (a later non-!important body rule outside the @media print block) made exported content render in a narrow left-aligned column instead of full width.

    **How to apply:** Keep a hidden, always-present DOM node (e.g. #notes-print-root) in the main page. On export, populate its innerHTML with the generated content, then call window.print() directly on the current window — no window.open(). Use the standard "print only this element" CSS pattern: `body * { visibility: hidden }`, `#id, #id * { visibility: visible }`, `#id { position: absolute; inset: 0; width: 100% }` inside @media print. This still uses the browser's native print engine (required — see pdf-popup-export.md for why html2canvas/jsPDF are avoided for text quality) but avoids popups entirely.
    