import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen, Plus, Search, Trash2, Save, Wand2, Sparkles, FileQuestion,
  Download, Eye, Pencil, Pin, Lightbulb, HelpCircle, BookMarked, Sigma,
  CalendarDays, Table as TableIcon, CheckSquare, ChevronDown, Loader2,
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

function mdToHtml(md: string): string {
  let html = escapeHtmlBasic(md);
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre class="code-block"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/^---+$/gm, '<hr>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ol-item">$1</li>');
  html = html.replace(/^[-*] \[x\] (.+)$/gm, '<li class="checked">✅ $1</li>');
  html = html.replace(/^[-*] \[ \] (.+)$/gm, '<li class="unchecked">☐ $1</li>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  const lines = html.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('<li class="ol-item">')) {
      result.push('<ol>');
      while (i < lines.length && lines[i].startsWith('<li class="ol-item">')) {
        result.push(lines[i].replace('<li class="ol-item">', '<li>'));
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
      if (line.trim() && !line.startsWith('<h') && !line.startsWith('<pre') && !line.startsWith('<blockquote') && !line.startsWith('<hr') && !line.startsWith('<ul') && !line.startsWith('<ol')) {
        result.push(`<p>${line}</p>`);
      } else {
        result.push(line);
      }
      i++;
    }
  }
  return result.join('\n');
}

function escapeHtmlBasic(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  // Every selector below is scoped under `.pdf-export-root` so it can be
  // rendered in an offscreen container attached to the *live* document
  // (required for html2canvas to rasterize real computed colors) without
  // leaking styles onto the rest of the app.
  const PDF_EXPORT_STYLES = `
    .pdf-export-root { font-family: 'Inter', system-ui, sans-serif; font-size: 14px; color: #0f172a; background: #fff; line-height: 1.75; width: 800px; padding: 48px 40px; box-sizing: border-box; }
    .pdf-export-root * { box-sizing: border-box; }
    .pdf-export-root .doc-header { border-bottom: 3px solid #7c3aed; padding-bottom: 20px; margin-bottom: 32px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .pdf-export-root .doc-title { font-size: 28px; font-weight: 700; color: #1e1b4b; line-height: 1.2; }
    .pdf-export-root .doc-meta { font-size: 11px; color: #64748b; margin-top: 6px; }
    .pdf-export-root .doc-badge { flex-shrink: 0; background: #7c3aed; color: #ffffff; font-size: 10px; font-weight: 700; padding: 6px 12px; border-radius: 20px; white-space: nowrap; letter-spacing: 0.5px; text-transform: uppercase; }
    .pdf-export-root h1 { font-size: 22px; font-weight: 700; color: #1e1b4b; margin: 28px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
    .pdf-export-root h2 { font-size: 17px; font-weight: 700; color: #4c1d95; margin: 22px 0 8px; padding: 8px 14px; background: #f5f3ff; border-left: 4px solid #7c3aed; border-radius: 0 8px 8px 0; }
    .pdf-export-root h3 { font-size: 14px; font-weight: 700; color: #1e1b4b; margin: 18px 0 6px; }
    .pdf-export-root h4 { font-size: 13px; font-weight: 600; color: #334155; margin: 14px 0 4px; }
    .pdf-export-root p { margin: 8px 0; color: #334155; }
    .pdf-export-root strong { color: #4c1d95; font-weight: 700; background: #fef9c3; padding: 1px 4px; border-radius: 3px; }
    .pdf-export-root em { color: #64748b; font-style: italic; }
    .pdf-export-root del { color: #94a3b8; text-decoration: line-through; }
    .pdf-export-root ul, .pdf-export-root ol { margin: 10px 0 10px 20px; color: #334155; }
    .pdf-export-root li { margin: 4px 0; padding-left: 4px; }
    .pdf-export-root li.checked { list-style: none; color: #15803d; }
    .pdf-export-root li.unchecked { list-style: none; color: #64748b; }
    .pdf-export-root .inline-code { font-family: 'Fira Mono', 'Courier New', monospace; background: #f1f5f9; color: #7c3aed; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .pdf-export-root .code-block { background: #1e293b; color: #e2f4ff; padding: 16px 20px; border-radius: 10px; margin: 16px 0; overflow-x: auto; font-size: 12px; line-height: 1.6; }
    .pdf-export-root .code-block code { font-family: 'Fira Mono', 'Courier New', monospace; color: #e2f4ff; }
    .pdf-export-root blockquote { border-left: 4px solid #7c3aed; background: #f5f3ff; padding: 10px 16px; margin: 14px 0; border-radius: 0 8px 8px 0; color: #4c1d95; font-style: italic; }
    .pdf-export-root table { border-collapse: collapse; width: 100%; margin: 14px 0; }
    .pdf-export-root thead { background: #7c3aed; }
    .pdf-export-root th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px; }
    .pdf-export-root td { padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 13px; }
    .pdf-export-root tr:nth-child(even) td { background: #f8faff; }
    .pdf-export-root tr:last-child td { border-bottom: none; }
    .pdf-export-root hr { border: none; border-top: 2px solid #e2e8f0; margin: 24px 0; }
    .pdf-export-root .doc-footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    .pdf-export-root .footer-brand { font-weight: 700; color: #7c3aed; }
  `;

  async function exportPDF() {
    if (!content.trim() && !title.trim()) return toast.error("Nothing to export");
    setExporting(true);
    let styleTag: HTMLStyleElement | null = null;
    let container: HTMLDivElement | null = null;
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      const bodyHtml = mdToHtml(content);
      const safeTitle = title || "Untitled Note";

      styleTag = document.createElement("style");
      styleTag.textContent = PDF_EXPORT_STYLES;
      document.head.appendChild(styleTag);

      container = document.createElement("div");
      container.className = "pdf-export-root";
      // Rendered fully on-screen (not display:none / visibility:hidden) so
      // html2canvas rasterizes real, visible computed colors — just pushed
      // off the visible viewport so the user never sees it flash by.
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "-10000px";
      container.style.zIndex = "-1";
      container.innerHTML = `
        <div class="doc-header">
          <div>
            <div class="doc-title">${escapeHtml(safeTitle)}</div>
            <div class="doc-meta">ScorpStudy by Bishal Bishwokarma &nbsp;•&nbsp; ${new Date().toLocaleString()} &nbsp;•&nbsp; ${content.trim().split(/\s+/).length} words</div>
          </div>
          <div class="doc-badge">✦ Smart Notes</div>
        </div>
        <div class="content">${bodyHtml}</div>
        <div class="doc-footer">
          <span>Generated by <span class="footer-brand">ScorpStudy by Bishal Bishwokarma</span> — AI-Powered Study Assistant</span>
        </div>
      `;
      document.body.appendChild(container);

      // Let the browser paint/layout before rasterizing.
      await new Promise((r) => setTimeout(r, 60));

      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: 800,
      });

      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `${safeTitle.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "ScorpStudy_Note"}.pdf`;
      pdf.save(filename);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to export PDF — please try again");
    } finally {
      if (container) document.body.removeChild(container);
      if (styleTag) document.head.removeChild(styleTag);
      setExporting(false);
    }
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
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <aside className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between">
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
        <ul className="mt-3 max-h-[65vh] space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="grid place-items-center py-10 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-500"><BookOpen className="h-7 w-7" /></div>
              <p className="mt-3 text-sm font-semibold">No notes yet</p>
              <p className="text-xs text-muted-foreground">Click + New Note to start writing</p>
            </li>
          )}
          {filtered.map((n) => (
            <li
              key={n.id}
              onClick={() => loadNote(n)}
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

      <section className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            placeholder="Note Title"
            className="w-full border-0 bg-transparent text-xl font-bold outline-none"
          />
          <span className={`whitespace-nowrap text-xs font-semibold ${dirty ? "text-amber-600" : "text-emerald-600"}`}>
            {dirty ? "● Unsaved" : `✓ ${savedAt ? `Saved ${savedAt}` : "Saved"}`}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-y border-border py-2 text-xs">
          <ToolBtn onClick={() => wrapSelection("**", "**", "bold text")} title="Bold (Ctrl+B)"><b>B</b></ToolBtn>
          <ToolBtn onClick={() => wrapSelection("*", "*", "italic")} title="Italic (Ctrl+I)"><i>I</i></ToolBtn>
          <Sep />
          <ToolBtn onClick={() => insertAtCursor("\n\n> 📌 **Important:** ")} title="Important"><Pin className="h-3 w-3 text-rose-500" /> Important</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n💡 **Key Concept:** ")} title="Key Concept"><Lightbulb className="h-3 w-3 text-amber-500" /> Key Concept</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n❓ **Study Question:** ")} title="Study Question"><HelpCircle className="h-3 w-3 text-violet-500" /> Study Q</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n📖 **Definition** — ")} title="Definition"><BookMarked className="h-3 w-3 text-emerald-500" /> Definition</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n$$ formula $$\n\n")} title="Formula"><Sigma className="h-3 w-3 text-blue-500" /> Formula</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor(`\n\n📅 ${new Date().toLocaleDateString()} — `)} title="Insert date"><CalendarDays className="h-3 w-3 text-orange-500" /> Date</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Row 1 | Row 1 |\n| Row 2 | Row 2 |\n\n")} title="Table"><TableIcon className="h-3 w-3 text-indigo-500" /> Table</ToolBtn>
          <ToolBtn onClick={() => insertAtCursor("\n- [ ] ")} title="Task"><CheckSquare className="h-3 w-3 text-emerald-600" /> Task</ToolBtn>
          <div className="relative">
            <ToolBtn onClick={() => setTmplOpen((v) => !v)} title="Templates">
              <span className="inline-flex items-center gap-1">Template <ChevronDown className="h-3 w-3" /></span>
            </ToolBtn>
            {tmplOpen && (
              <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
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
            <AiBtn loading={aiLoading === "enhance"} onClick={aiEnhance}><Sparkles className="h-3 w-3" /> Enhance</AiBtn>
            <AiBtn loading={aiLoading === "summarize"} onClick={aiSummarize}><Wand2 className="h-3 w-3" /> Summarize</AiBtn>
            <AiBtn onClick={quizMe}><FileQuestion className="h-3 w-3" /> Quiz Me</AiBtn>
            <AiBtn loading={exporting} onClick={exportPDF}><Download className="h-3 w-3" /> {exporting ? "Preparing…" : "Download PDF"}</AiBtn>
            <QuotaBadge quota={quota} loading={quotaLoading} />
            <button onClick={() => persist(true)} className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 font-semibold text-white shadow-md hover:opacity-90">
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
        </div>

        <div className="mt-4 min-h-[420px]">
          {view === "write" ? (
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); setDirty(true); }}
              rows={20}
              placeholder={`Start writing your notes here...\n\nPro tips:\n• Use the smart toolbar above to insert key concepts, important callouts, formulas, tables & tasks\n• Click "Template" for pre-built Lecture, Cornell, Study Guide formats\n• Ctrl+S saves • Ctrl+B bold • Ctrl+I italic\n• Switch to Preview to see your formatted notes rendered beautifully`}
              className="h-full min-h-[420px] w-full resize-none rounded-xl border border-border bg-slate-50/40 p-4 font-mono text-sm leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          ) : (
            <div className="min-h-[420px] rounded-xl border border-border bg-white p-5">
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
          <span>{aiLoading && <span className="inline-flex items-center gap-1 text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /> Bishal's Assistant working…</span>}</span>
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
