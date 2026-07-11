import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen, Plus, Search, Trash2, Save, Wand2, Sparkles, FileQuestion,
  FileDown, Eye, Pencil, Pin, Lightbulb, HelpCircle, BookMarked, Sigma,
  CalendarDays, Table as TableIcon, CheckSquare, ChevronDown, Loader2, Menu, X,
} from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/scorpstudy-logo.png";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/notes")({
  component: NotesPage,
});

type TemplateKey = "Lecture" | "Cornell" | "Study Guide";

const TEMPLATES: Record<TemplateKey, string> = {
  Lecture:
`# Lecture: <Topic>
**Date:** ${new Date().toLocaleDateString()}
**Instructor:**

## Overview
- 

## Main Points
1. 
2. 
3. 

## Examples
- 

## Summary
- 
`,
  Cornell:
`# <Topic> — Cornell Notes

| Cues / Questions | Notes |
| --- | --- |
| ?  |  |
| ?  |  |
| ?  |  |

## Summary
> 
`,
  "Study Guide":
`# Study Guide: <Topic>

## 🎯 Learning Objectives
- 

## 💡 Key Concepts
- 

## 📖 Definitions
- **Term:** 

## 🧠 Important
- 

## ❓ Study Questions
1. 
`,
};

// ─── PDF markdown → HTML ────────────────────────────────────────────────────
// Converts markdown to clean HTML for the print-preview popup.
// Rules:
//  • Strip raw HTML tags LLMs sometimes embed (<a name="...">, etc.)
//  • Handle GFM tables (pipe syntax)
//  • Convert [link text](url) → plain text only (no hyperlinks needed)
//  • Escape remaining HTML special chars
//  • Process headings, bold, italic, lists, blockquotes, HR, math, code

function escH(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function applyInlineMd(t: string): string {
  // Applied to already-HTML-escaped text; converts markdown inline syntax to HTML
  return t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // strip links, keep text
}

function parseCells(row: string): string[] {
  return row.replace(/^\||\|[\s]*$/g, '').split('|').map((c) => c.trim());
}

function mdToHtml(md: string): string {
  // 1. Strip raw HTML tags (anchors LLMs generate for ToC etc.)
  let t = md.replace(/<[^>]+>/g, '');

  // Placeholder bucket
  const blocks: string[] = [];
  const bk = (html: string) => { const i = blocks.length; blocks.push(html); return `\x00B${i}\x00`; };

  // 2. Fenced code blocks (extract before escaping)
  t = t.replace(/```[\w]*\r?\n?([\s\S]*?)```/g, (_, code) =>
    bk(`<pre class="code-block"><code>${escH(code.trim())}</code></pre>`));

  // 3. Inline code (extract before escaping)
  t = t.replace(/`([^`\n]+)`/g, (_, code) =>
    bk(`<code class="inline-code">${escH(code)}</code>`));

  // 4. Block math $...$ (extract before escaping)
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) =>
    bk(`<div class="math-block">${escH(math.trim())}</div>`));

  // 5. GFM tables — header | separator | rows
  // Match: header row \n separator row \n optional body rows
  const tableRe = /^(\|[^\n]+\|\n)(\|[-| :]+\|\n)((?:\|[^\n]+\|\n?)*)/gm;
  t = t.replace(tableRe, (_, headerLine, _sep, bodyStr) => {
    const headers = parseCells(headerLine);
    const bodyRows = bodyStr ? bodyStr.trim().split('\n').filter(Boolean) : [];
    let html = '<table><thead><tr>';
    html += headers.map((h) => `<th>${applyInlineMd(escH(h))}</th>`).join('');
    html += '</tr></thead>';
    if (bodyRows.length) {
      html += '<tbody>';
      html += bodyRows.map((rowLine: string) => {
        const cells = parseCells(rowLine);
        return '<tr>' + cells.map((c: string) => `<td>${applyInlineMd(escH(c))}</td>`).join('') + '</tr>';
      }).join('');
      html += '</tbody>';
    }
    html += '</table>';
    return bk(html) + '\n';
  });

  // 6. Escape remaining HTML special chars in body text
  t = t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  // 7. Headings
  t = t.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  t = t.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  t = t.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  t = t.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 8. Blockquotes (> is escaped to &gt; in step 6)
  t = t.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // 9. Horizontal rules
  t = t.replace(/^---+$/gm, '<hr>');

  // 10. Inline markdown (bold, italic, etc.) on body text
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 11. Inline math $...$
  t = t.replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>');

  // 12. Markdown links → keep text only
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // 13. Lists
  t = t.replace(/^\d+\. (.+)$/gm, '<li class="ol-item">$1</li>');
  t = t.replace(/^[-*] \[x\] (.+)$/gm, '<li class="checked">✅ $1</li>');
  t = t.replace(/^[-*] \[ \] (.+)$/gm, '<li class="unchecked">☐ $1</li>');
  t = t.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  // 14. Group list items and wrap plain lines in <p>
  const lines = t.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('<li class="ol-item">')) {
      result.push('<ol>');
      while (i < lines.length && lines[i].startsWith('<li class="ol-item">')) {
        result.push(lines[i].replace(' class="ol-item"', ''));
        i++;
      }
      result.push('</ol>');
    } else if (line.startsWith('<li')) {
      result.push('<ul>');
      while (i < lines.length && lines[i].startsWith('<li')) {
        result.push(lines[i]);
        i++;
      }
      result.push('</ul>');
    } else {
      const isBlock = line.startsWith('<h') || line.startsWith('<pre') ||
        line.startsWith('<blockquote') || line.startsWith('<hr') ||
        line.startsWith('<ul') || line.startsWith('<ol') ||
        line.startsWith('<table') || /^\x00B\d+\x00$/.test(line.trim());
      if (line.trim() && !isBlock) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push(line);
      }
      i++;
    }
  }

  // 15. Restore extracted blocks
  let html = result.join('\n');
  blocks.forEach((b, idx) => { html = html.replaceAll(`\x00B${idx}\x00`, b); });
  return html;
}

function NotesPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [view, setView] = useState<"write" | "preview">("write");
  const [aiLoading, setAiLoading] = useState<null | string>(null);
  const [exporting, setExporting] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [tmplOpen, setTmplOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "cerebras");

  const { data: notes } = useQuery({
    queryKey: ["notes", user.id],
    queryFn: async () =>
      (await supabase.from("notes").select("*").order("updated_at", { ascending: false })).data ?? [],
  });

  // Restore a specific note from history navigation
  useEffect(() => {
    if (!notes || notes.length === 0) return;
    try {
      const raw = sessionStorage.getItem("scorp_restore");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.type !== "Note" || !item.id) return;
      sessionStorage.removeItem("scorp_restore");
      const found = notes.find((n) => n.id === item.id);
      if (found) loadNote(found);
    } catch { /* silent */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  useEffect(() => {
    if (!dirty) return;
    if (!title.trim() && !content.trim()) return;
    const t = setTimeout(async () => {
      await persist();
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, dirty]);


  async function persist(showToast = false) {
    if (activeId) {
      const { error } = await supabase
        .from("notes")
        .update({ title: title || "Untitled", content })
        .eq("id", activeId);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase
        .from("notes")
        .insert({ user_id: user.id, title: title || "Untitled", content })
        .select()
        .single();
      if (error) return toast.error(error.message);
      if (data) setActiveId(data.id);
    }
    setSavedAt(new Date().toLocaleTimeString());
    setDirty(false);
    qc.invalidateQueries({ queryKey: ["notes"] });
    if (showToast) toast.success("Saved");
  }

  function loadNote(n: { id: string; title: string; content: string | null }) {
    setActiveId(n.id);
    setTitle(n.title);
    setContent(n.content ?? "");
    setSavedAt("just now");
    setView("write");
    setDirty(false);
  }
  function newNote() {
    setActiveId(null);
    setTitle("");
    setContent("");
    setSavedAt(null);
    setView("write");
    setDirty(false);
    setTimeout(() => editorRef.current?.focus(), 50);
  }

  function insertAtCursor(text: string) {
    const ta = editorRef.current;
    if (!ta) {
      setContent(content + text);
      setDirty(true);
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = content.slice(0, s) + text + content.slice(e);
    setContent(next);
    setDirty(true);
    setTimeout(() => {
      ta.focus();
      const pos = s + text.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  }

  function wrapSelection(prefix: string, suffix = prefix, placeholder = "") {
    const ta = editorRef.current;
    if (!ta) return insertAtCursor(`${prefix}${placeholder}${suffix}`);
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = content.slice(s, e) || placeholder;
    const next = content.slice(0, s) + prefix + sel + suffix + content.slice(e);
    setContent(next);
    setDirty(true);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length + sel.length);
    }, 0);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "s") { e.preventDefault(); persist(true); }
      if (e.key === "b") { e.preventDefault(); wrapSelection("**", "**", "bold"); }
      if (e.key === "i") { e.preventDefault(); wrapSelection("*", "*", "italic"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, activeId]);

  async function aiEnhance() {
    if (!content.trim()) return toast.error("Write something first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setAiLoading("enhance");
    const res = await askAI(
      `Improve, restructure, and substantially expand these study notes into a long, thorough, exam-ready version — do NOT just lightly polish them, make them noticeably longer and more detailed. Keep the original meaning and facts, fix grammar, and:\n- Add clear Markdown headings and sub-headings to organize the material\n- Expand every key point with more explanation, context, and relevant detail a student would need to fully understand it (not just one-line bullets)\n- Add examples, analogies, or clarifying notes wherever they would help understanding\n- Bold every key term with **\n- If helpful, add a short summary section at the end\n\nBe comprehensive and detailed throughout — a long, complete write-up is required, not a brief rewording.\n\nNotes:\n${content}`,
      "You are an expert study tutor who writes long, thorough, detailed notes — never brief ones. Always expand and add useful depth rather than just rephrasing.",
      undefined, true,
    );
    setContent(res.text);
    setDirty(true);
    await bump();
    setAiLoading(null);
    toast.success("Enhanced");
  }
  async function aiSummarize() {
    if (!content.trim()) return toast.error("Write something first");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setAiLoading("summarize");
    const res = await askAI(`Summarize these notes as crisp bullet points with bolded key terms:\n${content}`, undefined, undefined, true);
    setContent(`${content}\n\n---\n\n## ✨ Summary\n${res.text}`);
    setDirty(true);
    await bump();
    setAiLoading(null);
    toast.success("Summary appended");
  }
  async function quizMe() {
    if (!content.trim()) return toast.error("Write something first");
    await persist();
    sessionStorage.setItem("scorp_quiz_topic", `${title}\n\n${content}`.slice(0, 4000));
    toast.success("Topic sent to Quiz Generator");
    navigate({ to: "/dashboard/quiz" });
  }

  // Opens a styled print-preview popup window with a "Download PDF" button.
  // Uses the browser's native print engine — avoids html2canvas entirely,
  // giving perfect word-spacing, correct highlight positions, and proper tables.
  function exportPDF() {
    if (!content.trim() && !title.trim()) return toast.error("Nothing to export");
    const safeTitle = title || "Untitled Note";
    const bodyHtml = mdToHtml(content);
    const wordCount = content.trim().split(/\s+/).length;
    const dateStr = new Date().toLocaleString();

    const popup = window.open("", "_blank", "width=960,height=750,scrollbars=yes,resizable=yes");
    if (!popup) { toast.error("Please allow popups for this site to export PDFs"); return; }

    popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(safeTitle)} — ScorpStudy</title>
  <style>
    /* ── Screen: floating download bar ─────────────────────────────── */
    @media screen {
      .dl-bar {
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        background: #4c1d95; color: #fff;
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 28px; gap: 12px;
        font-family: -apple-system,'Segoe UI',Arial,sans-serif; font-size: 13px;
        box-shadow: 0 2px 12px rgba(0,0,0,.25);
      }
      .dl-bar .brand { font-weight: 700; letter-spacing: .4px; }
      .dl-bar .hint { font-size: 11px; opacity: .8; }
      .dl-bar .btn {
        background: #fff; color: #4c1d95; border: none; cursor: pointer;
        padding: 8px 22px; border-radius: 8px; font-size: 13px; font-weight: 700;
        display: flex; align-items: center; gap: 6px; white-space: nowrap;
        transition: background .15s;
      }
      .dl-bar .btn:hover { background: #f5f3ff; }
      body { margin-top: 54px; }
    }
    /* ── Print: hide bar, set margins ───────────────────────────────── */
    @media print {
      .dl-bar { display: none !important; }
      body { margin: 0 !important; }
      @page { margin: 22mm 20mm 22mm 20mm; }
      h1, h2, h3, h4 { page-break-after: avoid; }
      pre, table, blockquote { page-break-inside: avoid; }
    }
    /* ── Document body ────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: Georgia,'Times New Roman',serif;
      font-size: 11pt; line-height: 1.85; color: #1a1a2e;
      background: #fff; max-width: 780px;
      margin-left: auto; margin-right: auto;
      padding: 36px 52px 72px;
    }
    /* Header */
    .doc-header {
      border-bottom: 3px solid #7c3aed;
      padding-bottom: 18px; margin-bottom: 34px;
    }
    .doc-title {
      font-family: -apple-system,'Segoe UI',Arial,sans-serif;
      font-size: 26pt; font-weight: 800; color: #1e1b4b;
      margin: 0 0 6px; line-height: 1.2; word-break: break-word;
    }
    .doc-meta {
      font-family: -apple-system,'Segoe UI',Arial,sans-serif;
      font-size: 9pt; color: #64748b;
    }
    /* Headings */
    h1, h2, h3, h4 {
      font-family: -apple-system,'Segoe UI',Arial,sans-serif;
      color: #1e1b4b; margin-top: 28px; margin-bottom: 8px; line-height: 1.3;
    }
    h1 { font-size: 17pt; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    h2 {
      font-size: 13pt; color: #4c1d95;
      background: #f5f3ff; padding: 8px 14px;
      border-left: 4px solid #7c3aed; margin-top: 26px;
    }
    h3 { font-size: 12pt; }
    h4 { font-size: 11pt; color: #334155; }
    /* Body text */
    p { margin: 9px 0; color: #334155; }
    strong { color: #4c1d95; font-weight: 700; background: #fef9c3; padding: 0 2px; }
    em { color: #475569; }
    del { color: #94a3b8; text-decoration: line-through; }
    /* Lists */
    ul, ol { margin: 10px 0 10px 26px; color: #334155; }
    li { margin: 5px 0; line-height: 1.7; }
    li.checked { list-style: none; margin-left: -20px; color: #15803d; }
    li.unchecked { list-style: none; margin-left: -20px; color: #64748b; }
    /* Code */
    code.inline-code {
      font-family: 'Courier New',Courier,monospace;
      background: #f1f5f9; color: #7c3aed; font-size: 9.5pt;
      padding: 0 3px;
    }
    pre.code-block {
      background: #1e293b; color: #e2f4ff;
      padding: 16px 20px; border-radius: 8px; margin: 16px 0;
      font-size: 9pt; line-height: 1.65;
      white-space: pre-wrap; word-break: break-all;
    }
    pre.code-block code {
      font-family: 'Courier New',Courier,monospace; color: #e2f4ff;
      background: none; font-size: inherit; padding: 0;
    }
    /* Blockquote */
    blockquote {
      border-left: 4px solid #7c3aed; background: #f5f3ff;
      padding: 10px 16px; margin: 14px 0; color: #4c1d95; font-style: italic;
    }
    /* Tables */
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 10pt; font-family: -apple-system,'Segoe UI',Arial,sans-serif; }
    thead { background: #7c3aed; }
    th { padding: 9px 13px; text-align: left; font-size: 9pt; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .4px; }
    td { padding: 8px 13px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    tr:nth-child(even) td { background: #f8faff; }
    tr:last-child td { border-bottom: none; }
    /* Math */
    .math-block {
      font-family: 'Courier New',Courier,monospace;
      background: #f8faff; border: 1px solid #e2e8f0;
      border-left: 4px solid #7c3aed;
      padding: 12px 16px; margin: 16px 0; font-size: 11pt;
      white-space: pre-wrap; color: #1e1b4b;
    }
    .math-inline { font-family: 'Courier New',Courier,monospace; color: #4c1d95; }
    /* HR */
    hr { border: none; border-top: 2px solid #e2e8f0; margin: 24px 0; }
    /* Footer */
    .doc-footer {
      margin-top: 52px; padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-family: -apple-system,'Segoe UI',Arial,sans-serif;
      font-size: 8.5pt; color: #94a3b8;
    }
    .footer-brand { font-weight: 700; color: #7c3aed; }
  </style>
</head>
<body>
  <div class="dl-bar">
    <div>
      <span class="brand">📄 ScorpStudy Smart Notes Preview</span>
      <span class="hint"> &nbsp;—&nbsp; In the print dialog, set Destination to "Save as PDF"</span>
    </div>
    <button class="btn" onclick="window.print()">⬇ Download PDF</button>
  </div>

  <div class="doc-header">
    <div class="doc-title">${escapeHtml(safeTitle)}</div>
    <div class="doc-meta">ScorpStudy by Bishal Bishwokarma &nbsp;•&nbsp; ${escapeHtml(dateStr)} &nbsp;•&nbsp; ${wordCount} words</div>
  </div>

  ${bodyHtml}

  <div class="doc-footer">
    Generated by <span class="footer-brand">ScorpStudy by Bishal Bishwokarma</span> — AI‑Powered Study Assistant
  </div>
</body>
</html>`);
    popup.document.close();
    toast.success("Preview opened — click \"Download PDF\" in the popup to save");
  }

  async function del(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    if (id === activeId) newNote();
    qc.invalidateQueries({ queryKey: ["notes"] });
    toast.success("Deleted");
  }

  const filtered = useMemo(() => {
    return (notes ?? []).filter(
      (n) =>
        !search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        (n.content ?? "").toLowerCase().includes(search.toLowerCase()),
    );
  }, [notes, search]);

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const readMin = Math.max(1, Math.round(words / 200));

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[300px_1fr]">

      {/* ── Mobile top bar: toggle sidebar ── */}
      <div className="flex items-center justify-between lg:hidden rounded-2xl border border-border bg-white px-4 py-3">
        <div className="flex items-center gap-2 font-bold text-sm">
          <img src={logoUrl} alt="" className="h-5 w-5 object-contain" />
          <span>Smart Notes</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{(notes ?? []).length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newNote} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
          <button onClick={() => setShowSidebar((v) => !v)} className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-white hover:bg-accent">
            {showSidebar ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Sidebar (always on lg, toggled on mobile) ── */}
      <aside className={`rounded-2xl border border-border bg-white p-4 ${showSidebar ? "block" : "hidden"} lg:block`}>
        {/* Desktop header */}
        <div className="hidden lg:flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold">
            <img src={logoUrl} alt="" className="h-6 w-6 object-contain" />
            <span>Smart Notes</span>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{(notes ?? []).length}</span>
          </div>
          <button onClick={newNote} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:opacity-90">
            <Plus className="h-3.5 w-3.5" /> New Note
          </button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="w-full rounded-lg border border-border bg-slate-50/60 px-8 py-2 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
          />
        </div>
        <ul className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="grid place-items-center py-10 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-500"><BookOpen className="h-7 w-7" /></div>
              <p className="mt-3 text-sm font-semibold">No notes yet</p>
              <p className="text-xs text-muted-foreground">Create your first note above</p>
            </li>
          )}
          {filtered.map((n) => (
            <li
              key={n.id}
              onClick={() => { loadNote(n); setShowSidebar(false); }}
              className={`group cursor-pointer rounded-lg p-2.5 text-sm transition ${activeId === n.id ? "bg-violet-50 ring-1 ring-violet-200" : "hover:bg-accent"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="line-clamp-1 font-medium">{n.title || "Untitled"}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{(n.content ?? "").replace(/[#*_>`]/g, "").slice(0, 60) || "Empty note"}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); del(n.id); }} className="hidden text-muted-foreground hover:text-destructive group-hover:block">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Main editor / preview ── */}
      <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="Note Title"
            className="min-w-0 flex-1 border-0 bg-transparent text-lg font-bold outline-none sm:text-xl"
          />
          <span className={`shrink-0 whitespace-nowrap text-xs font-semibold ${dirty ? "text-amber-600" : "text-emerald-600"}`}>
            {dirty ? "● Unsaved" : `✓ ${savedAt ? `Saved ${savedAt}` : "Saved"}`}
          </span>
        </div>

        {/* Toolbar */}
        <div className="mt-3 flex flex-wrap items-center gap-1 border-y border-border py-2 text-xs">
          <ToolBtn onClick={() => wrapSelection("**", "**", "bold text")} title="Bold (Ctrl+B)"><b>B</b></ToolBtn>
          <ToolBtn onClick={() => wrapSelection("*", "*", "italic")} title="Italic (Ctrl+I)"><i>I</i></ToolBtn>
          <Sep />
          <ToolBtn onClick={() => insertAtCursor("\n\n> 📌 **Important:** ")} title="Important"><Pin className="h-3 w-3 text-rose-500" /><span className="hidden sm:inline"> Important</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n💡 **Key Concept:** ")} title="Key Concept"><Lightbulb className="h-3 w-3 text-amber-500" /><span className="hidden sm:inline"> Key Concept</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n❓ **Study Question:** ")} title="Study Question"><HelpCircle className="h-3 w-3 text-violet-500" /><span className="hidden sm:inline"> Study Q</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n📖 **Definition** — ")} title="Definition"><BookMarked className="h-3 w-3 text-emerald-500" /><span className="hidden sm:inline"> Definition</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n$ formula $\n\n")} title="Formula"><Sigma className="h-3 w-3 text-blue-500" /><span className="hidden sm:inline"> Formula</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor(`\n\n📅 ${new Date().toLocaleDateString()} — `)} title="Insert date"><CalendarDays className="h-3 w-3 text-orange-500" /><span className="hidden sm:inline"> Date</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Row 1 | Row 1 |\n| Row 2 | Row 2 |\n\n")} title="Table"><TableIcon className="h-3 w-3 text-indigo-500" /><span className="hidden sm:inline"> Table</span></ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n- [ ] ")} title="Task"><CheckSquare className="h-3 w-3 text-emerald-600" /><span className="hidden sm:inline"> Task</span></ToolBtn>
          <div className="relative">
            <ToolBtn onClick={() => setTmplOpen((v) => !v)} title="Templates">
              <span className="inline-flex items-center gap-1"><span className="hidden sm:inline">Template</span><span className="sm:hidden">Tmpl</span> <ChevronDown className="h-3 w-3" /></span>
            </ToolBtn>
            {tmplOpen && (
              <div className="absolute left-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
                {(Object.keys(TEMPLATES) as TemplateKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => { setContent((c) => (c ? `${c}\n\n${TEMPLATES[k]}` : TEMPLATES[k])); setDirty(true); setTmplOpen(false); }}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                  >{k}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-border bg-slate-50 p-0.5 text-xs">
            <button onClick={() => setView("write")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${view === "write" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
              <Pencil className="h-3 w-3" /> Write
            </button>
            <button onClick={() => setView("preview")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${view === "preview" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
              <Eye className="h-3 w-3" /> Preview
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <AiBtn loading={aiLoading === "enhance"} onClick={aiEnhance}><Sparkles className="h-3 w-3" /><span className="hidden sm:inline"> Enhance</span></AiBtn>
            <AiBtn loading={aiLoading === "summarize"} onClick={aiSummarize}><Wand2 className="h-3 w-3" /><span className="hidden sm:inline"> Summarize</span></AiBtn>
            <AiBtn onClick={quizMe}><FileQuestion className="h-3 w-3" /><span className="hidden sm:inline"> Quiz Me</span></AiBtn>
            <AiBtn onClick={exportPDF}><FileDown className="h-3 w-3" /><span className="hidden sm:inline"> Export PDF</span></AiBtn>
            <QuotaBadge quota={quota} loading={quotaLoading} />
            <button onClick={() => persist(true)} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 font-semibold text-white shadow-md hover:opacity-90">
              <Save className="h-3 w-3" /><span className="hidden sm:inline"> Save</span>
            </button>
          </div>
        </div>

        {/* Write / Preview pane */}
        <div className="mt-4 min-h-[360px] sm:min-h-[420px]">
          {view === "write" ? (
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); setDirty(true); }}
              rows={18}
              placeholder={`Start writing your notes here…\n\nTips:\n• Toolbar above for bold, headings, tables, formulas & tasks\n• "Template" for pre-built study formats\n• Ctrl+S saves • Ctrl+B bold • Ctrl+I italic\n• Switch to Preview to see formatted notes`}
              className="h-full min-h-[360px] w-full resize-none rounded-xl border border-border bg-slate-50/40 p-4 font-mono text-sm leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 sm:min-h-[420px]"
            />
          ) : (
            <div className="min-h-[360px] overflow-x-auto rounded-xl border border-border bg-white p-4 sm:min-h-[420px] sm:p-5">
              {content.trim() ? (
                <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:my-2 prose-li:my-0.5">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      strong: ({ children }) => <mark className="bg-yellow-200 text-yellow-900 font-bold rounded px-0.5 not-italic">{children}</mark>,
                    }}
                  >{content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
          <span>{words} words • {readMin} min read</span>
          <span>{aiLoading && <span className="inline-flex items-center gap-1 text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /> AI working…</span>}</span>
        </div>
      </section>
    </div>
  );
}

function ToolBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-accent">
      {children}
    </button>
  );
}
function Sep() { return <span className="mx-1 h-4 w-px bg-border" />; }
function AiBtn({ children, onClick, loading }: { children: React.ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : children}
    </button>
  );
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
