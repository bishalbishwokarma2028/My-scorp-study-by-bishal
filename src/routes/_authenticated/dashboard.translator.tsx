import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, Copy, ArrowLeftRight, Save, Languages, Sparkles, Trash2, History } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/translator")({
  component: TranslatorPage,
});

const LANGS = [
  "Auto-detect", "English", "Nepali", "Hindi", "Spanish", "French", "German", "Japanese",
  "Chinese", "Arabic", "Korean", "Portuguese", "Russian", "Italian", "Turkish",
  "Vietnamese", "Thai", "Bengali", "Urdu", "Malay", "Indonesian", "Dutch", "Polish",
  "Swedish", "Greek", "Hebrew", "Tamil", "Telugu", "Punjabi", "Marathi", "Filipino",
];

const LANG_CODE: Record<string, string> = {
  English: "en", Nepali: "ne", Hindi: "hi", Spanish: "es", French: "fr", German: "de",
  Japanese: "ja", Chinese: "zh", Arabic: "ar", Korean: "ko", Portuguese: "pt", Russian: "ru",
  Italian: "it", Turkish: "tr", Vietnamese: "vi", Thai: "th", Bengali: "bn", Urdu: "ur",
  Malay: "ms", Indonesian: "id", Dutch: "nl", Polish: "pl", Swedish: "sv", Greek: "el",
  Hebrew: "he", Tamil: "ta", Telugu: "te", Punjabi: "pa", Marathi: "mr", Filipino: "fil",
};

const MAX_CHARS = 5000;

function TranslatorPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("Auto-detect");
  const [target, setTarget] = useState("Spanish");
  const [loading, setLoading] = useState(false);
  const [auto] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "groq");

  // Restore from history
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("scorp_restore");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.type !== "Translation") return;
      sessionStorage.removeItem("scorp_restore");
      if (item.original_text) setText(item.original_text);
      if (item.translated_text) setResult(item.translated_text);
      if (item.source_language) setSource(item.source_language);
      if (item.target_language) setTarget(item.target_language);
    } catch { /* silent */ }
  }, []);

  const { data: history } = useQuery({
    queryKey: ["translations", user.id],
    queryFn: async () =>
      (await supabase.from("translations").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  async function translate() {
    if (!text.trim()) return toast.error("Type something to translate");
    if (text.length > MAX_CHARS) return toast.error(`Limit ${MAX_CHARS} characters`);
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    setResult("");
    try {
      const isAutoDetect = source === "Auto-detect";
      const from = isAutoDetect ? "the detected language" : source;
      const romanizedNote = !isAutoDetect && ["Nepali","Hindi","Arabic","Chinese","Japanese","Korean","Bengali","Tamil","Telugu","Urdu","Punjabi","Marathi","Greek","Hebrew","Russian","Thai","Vietnamese"].includes(source)
        ? `IMPORTANT: The source language is ${source} which uses a non-Latin script. If the input text is written in Roman/Latin letters (romanized/transliterated ${source}), you MUST first mentally convert it to the native ${source} script, then translate it to ${target}. Examples of romanized ${source}: Nepali — "mero naam Bishal ho" = "मेरो नाम बिशाल हो", "tapai lai kasto chha" = "तपाईलाई कस्तो छ"; Hindi — "mujhe bhook lagi hai" = "मुझे भूख लगी है", "aap kaise hain" = "आप कैसे हैं". Apply the same logic for other languages.`
        : isAutoDetect ? `IMPORTANT: Auto-detect the language. If the text appears to be romanized/transliterated (written in Latin letters but representing a non-Latin language like Nepali, Hindi, Arabic, etc.), detect the intended language, convert to native script, then translate.`
        : "";
      const res = await askAI(
        `You are a professional human translator with native-level fluency in both ${from} and ${target}.

${romanizedNote}

Translate the following text from ${from} to ${target}.

TRANSLATION RULES (follow every rule):
1. Produce a NATURAL, FLUENT translation — as if originally written in ${target} by a native speaker.
2. Preserve the original MEANING, TONE, and REGISTER (formal stays formal, casual stays casual, technical stays technical).
3. Use correct ${target} GRAMMAR and natural sentence structure — never translate word-for-word.
4. Preserve TECHNICAL TERMINOLOGY accurately; use the accepted ${target} term, not a literal calque.
5. Preserve PROPER NOUNS, names, and titles as-is unless they have a well-known ${target} equivalent.
6. Keep FORMATTING (paragraphs, bullet points, line breaks) identical to the source.
7. Output ONLY the translated text — no explanations, no notes, no quotes, no "Translation:" prefix.

TEXT TO TRANSLATE:
${text}`,
        `You are a professional human translator specialising in accurate, natural, context-aware multilingual translation. When source is a non-Latin language but text is in Latin script, first mentally reconstruct the native-script original, then translate. Produce idiomatic target-language output that preserves meaning, tone, grammar, and technical terminology. Output ONLY the final translation.`,
      );
      const translated = res.text.trim().replace(/^["']|["']$/g, "").replace(/^Translation:\s*/i, "").trim();
      if (!translated) {
        toast.error("Translation returned empty — please try again");
      } else {
        setResult(translated);
        await bump();
      }
    } catch (err) {
      toast.error("Translation failed — please try again");
      console.error("[Translator]", err);
    } finally {
      setLoading(false);
    }
  }

  // Auto-translate (debounced)
  useEffect(() => {
    if (!auto || !text.trim()) return;
    const t = setTimeout(() => { translate(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, source, target, auto]);

  async function detect() {
    if (!text.trim()) return toast.error("Type something first");
    const res = await askAI(`Identify the language of this text. Reply with ONE WORD only — the English name of the language.\n\n${text}`);
    const lang = res.text.trim().split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
    if (LANGS.includes(lang)) { setSource(lang); toast.success(`Detected: ${lang}`); }
    else toast.message(`Detected: ${res.text.trim()}`);
  }

  function speak(txt: string, lang: string) {
    if (!txt) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      const code = LANG_CODE[lang];
      if (code) u.lang = code;
      window.speechSynthesis.speak(u);
    } catch { toast.error("Speech not supported"); }
  }

  function swap() {
    if (source === "Auto-detect") return toast.error("Pick a source language to swap");
    const s = source, t = target, tx = text, rx = result;
    setSource(t); setTarget(s); setText(rx); setResult(tx);
  }

  async function save() {
    if (!result.trim()) return toast.error("Nothing to save");
    const { error } = await supabase.from("translations").insert({
      user_id: user.id,
      original_text: text,
      translated_text: result,
      source_language: source,
      target_language: target,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved to history");
    qc.invalidateQueries({ queryKey: ["translations"] });
  }

  async function delItem(id: string) {
    await supabase.from("translations").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["translations"] });
  }

  function loadHistory(h: { original_text: string | null; translated_text: string | null; source_language: string | null; target_language: string | null }) {
    setText(h.original_text ?? "");
    setResult(h.translated_text ?? "");
    if (h.source_language) setSource(h.source_language);
    if (h.target_language) setTarget(h.target_language);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Languages className="h-6 w-6 text-violet-600" /> Universal Translator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">30+ languages, auto-detect, listen & save — powered by Bishal's Assistant.</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Beta disclaimer */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="mt-0.5 text-base leading-none">⚠️</span>
        <p><span className="font-semibold">Beta feature:</span> Translations are AI-generated and may not be perfectly accurate. Always verify important translations with a native speaker or professional service.</p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium">
            {LANGS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <button onClick={swap} title="Swap" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-white hover:bg-accent">
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium">
            {LANGS.filter((l) => l !== "Auto-detect").map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-slate-50/50 p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              rows={9}
              placeholder="Type or paste text..."
              className="w-full resize-none bg-transparent text-sm outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{text.length} / {MAX_CHARS}</span>
              <div className="flex flex-wrap gap-1.5">
                <ChipBtn onClick={detect}><Sparkles className="h-3 w-3" /> Detect language</ChipBtn>
                <ChipBtn onClick={() => speak(text, source)}><Volume2 className="h-3 w-3" /> Listen</ChipBtn>
                <ChipBtn onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}><Copy className="h-3 w-3" /> Copy</ChipBtn>
                <ChipBtn onClick={() => setText("")}><Trash2 className="h-3 w-3" /> Clear</ChipBtn>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
            <textarea
              readOnly
              value={loading ? "Translating…" : result}
              rows={9}
              placeholder="Translation will appear here..."
              className="w-full resize-none bg-transparent text-sm outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{result.length} chars</span>
              <div className="flex flex-wrap gap-1.5">
                <ChipBtn onClick={() => speak(result, target)}><Volume2 className="h-3 w-3" /> Listen</ChipBtn>
                <ChipBtn onClick={() => { navigator.clipboard.writeText(result); toast.success("Copied"); }}><Copy className="h-3 w-3" /> Copy</ChipBtn>
                <ChipBtn onClick={save}><Save className="h-3 w-3" /> Save</ChipBtn>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={translate}
          disabled={loading || !text.trim()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          Translate
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><History className="h-4 w-4 text-violet-600" /> Recent Translations</h2>
        {(!history || history.length === 0) ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No saved translations yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                <button onClick={() => loadHistory(h)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-primary">{h.source_language} → {h.target_language}</span>
                    <span>{new Date(h.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm">{h.original_text}</p>
                  <p className="line-clamp-1 text-sm font-medium text-violet-700">{h.translated_text}</p>
                </button>
                <button onClick={() => delItem(h.id)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ChipBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 hover:bg-accent">
      {children}
    </button>
  );
}
