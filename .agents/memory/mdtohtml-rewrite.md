---
    name: mdToHtml markdown-to-HTML conversion rules
    description: Key rules for the mdToHtml() function used in Smart Notes PDF export popup
    ---

    ## Rule
    mdToHtml() in dashboard.notes.tsx must handle these in order:
    1. Strip raw HTML tags first (LLMs embed <a name> anchors for ToC)
    2. Extract code blocks and inline code into placeholders BEFORE HTML-escaping
    3. Detect GFM tables before HTML-escaping; escape cell content per-cell
    4. HTML-escape the remaining body text
    5. Blockquotes: after escaping, match ^&gt; (> is now &gt;)
    6. Strip markdown links [text](url) to plain text
    7. Restore placeholders at the end

    **Why:** HTML-escaping first then parsing tables results in pipe characters being escaped, breaking table detection. LLM raw HTML tags appear as literal text if not stripped first.
    