---
    name: PDF export via browser print popup
    description: Using browser-native window.print() popup instead of html2canvas/jsPDF for notes PDF export
    ---

    ## Rule
    Always use a browser popup window + window.print() for PDF export in Smart Notes. Never use html2canvas or jsPDF for text-heavy content.

    **Why:** html2canvas has fundamental text compression bugs — word-spacing and letter-spacing are not preserved, producing PDFs where all letters run together. Tables, links, and highlighted terms all break visually. The browser's native print engine renders everything perfectly.

    **How to apply:** Call window.open('', '_blank', '...'), write the full styled HTML document into popup.document, then popup.document.close(). Include a floating .dl-bar with a "Download PDF" button that calls window.print(). @media print hides the bar and sets proper page margins. mdToHtml() converts markdown to clean HTML for the popup.
    