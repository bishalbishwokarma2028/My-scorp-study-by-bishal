import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Volume2, Copy, ArrowLeftRight, Save, Languages, Sparkles, Trash2, History, Wand2 } from "lucide-react";
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

// ─── Script / language detection helpers ─────────────────────────────────────

/** Returns true if the string contains Devanagari Unicode (Nepali & Hindi script). */
function hasDevanagari(s: string) {
  return /[\u0900-\u097F]/.test(s);
}
/** Returns true if the string contains Arabic-script Unicode (Arabic, Urdu, etc.). */
function hasArabicScript(s: string) {
  return /[\u0600-\u06FF]/.test(s);
}
/** Returns true if the string contains CJK (Chinese / Japanese) characters. */
function hasCJK(s: string) {
  return /[\u3000-\u9FFF\uAC00-\uD7FF]/.test(s);
}
/** Returns true if the string contains Cyrillic characters (Russian, etc.). */
function hasCyrillic(s: string) {
  return /[\u0400-\u04FF]/.test(s);
}
/** Returns true if the string contains Greek characters. */
function hasGreek(s: string) {
  return /[\u0370-\u03FF]/.test(s);
}
/** Returns true if the string contains Thai characters. */
function hasThai(s: string) {
  return /[\u0E00-\u0E7F]/.test(s);
}

/**
 * Heuristically detect the source language from Unicode script blocks.
 * Returns null if the script is Latin (can't distinguish without LLM).
 */
function detectScriptLanguage(text: string): string | null {
  if (hasDevanagari(text)) {
    // Both Nepali and Hindi use Devanagari. Default to Nepali (Bishal's use-case).
    // We pick Nepali here; user can override with the dropdown.
    return "Nepali";
  }
  if (hasArabicScript(text)) return "Arabic";
  if (hasCJK(text)) return "Chinese";
  if (hasCyrillic(text)) return "Russian";
  if (hasGreek(text)) return "Greek";
  if (hasThai(text)) return "Thai";
  return null; // Latin script — need LLM detection
}

// ─── Build rich, accurate translation prompt ──────────────────────────────────

function buildTranslatePrompt(text: string, from: string, target: string, isAutoDetect: boolean): string {
  // Script-aware notes
  const scriptNote = (() => {
    if (isAutoDetect) {
      // Give the model explicit Unicode info
      const scriptLang = detectScriptLanguage(text);
      if (scriptLang) {
        return `NOTE: The input text is written in ${scriptLang} script (Unicode). Treat it as ${scriptLang} and translate to ${target}.`;
      }
      return `NOTE: Auto-detect the source language from the text. If it looks like romanized/transliterated text (Latin letters representing a non-Latin language such as Nepali — e.g. "mero naam Bishal ho" = मेरो नाम बिशाल हो — or Hindi, Arabic, etc.), identify the intended language first, then translate to ${target}.`;
    }

    const nonLatinLangs = ["Nepali","Hindi","Arabic","Chinese","Japanese","Korean","Bengali","Tamil","Telugu","Urdu","Punjabi","Marathi","Greek","Hebrew","Russian","Thai","Vietnamese","Filipino"];
    if (nonLatinLangs.includes(from)) {
      const scriptLang = detectScriptLanguage(text);
      if (scriptLang) {
        // Input is already in native Unicode — no romanization needed
        return `NOTE: The source text is written in ${from} Unicode/native script. Read and translate it accurately.`;
      }
      // Input appears to be Latin script for a non-Latin language (romanized)
      const nepaliExamples = from === "Nepali"
        ? ` Examples: "mero naam Bishal ho" = "मेरो नाम बिशाल हो", "tapai lai kasto chha" = "तपाईलाई कस्तो छ", "ma school jaanchhu" = "म स्कुल जान्छु", "dhanyabad" = "धन्यवाद", "ramro" = "राम्रो", "kina" = "किन".`
        : from === "Hindi"
        ? ` Examples: "mujhe bhook lagi hai" = "मुझे भूख लगी है", "aap kaise hain" = "आप कैसे हैं".`
        : "";
      return `NOTE: The source language is ${from} but the text appears to be written in Latin/Roman letters (romanized/transliterated ${from}). First mentally convert the romanized text to its native ${from} Unicode script, then translate to ${target}.${nepaliExamples}`;
    }
    return "";
  })();

  return `You are a professional human translator with native-level fluency in ${from === "Auto-detect" ? "any language" : from} and ${target}.

${scriptNote}

Translate the following text to ${target}.

STRICT TRANSLATION RULES — follow every rule without exception:
1. ACCURACY: The translation must faithfully convey the complete, exact meaning of the source text — no additions, omissions, or distortions.
2. NATURALNESS: Write as a native ${target} speaker would naturally write — not as a word-for-word copy of the source structure.
3. GRAMMAR: Use correct ${target} grammar, syntax, and sentence structure. Rearrange phrases as needed for natural flow.
4. TONE & REGISTER: Preserve the original tone exactly — formal stays formal, informal stays informal, academic stays academic, poetic stays poetic.
5. TERMINOLOGY: Preserve technical, professional, and domain-specific terms accurately. Use the accepted ${target} term where one exists.
6. PROPER NOUNS: Keep names, places, and titles as-is unless a well-established ${target} equivalent exists.
7. UNICODE: If the source contains Unicode characters (Devanagari, Arabic, CJK, Cyrillic, etc.), read them correctly as the intended script.
8. FORMATTING: Preserve all formatting — paragraphs, bullet points, line breaks, and numbering must appear in the same structure.
9. OUTPUT: Return ONLY the translated text. Do NOT include the original text, any explanation, notes, labels like "Translation:", quotation marks around the result, or any preamble.

SOURCE TEXT:
${text}`;
}

function buildSystemPrompt(from: string, target: string): string {
  return `You are an expert professional translator with native-level mastery of ${from === "Auto-detect" ? "all major world languages" : from} and ${target}. You produce translations that read as if originally written in the target language. You always preserve meaning, tone, register, and technical accuracy. You handle Unicode scripts (Devanagari, Arabic, CJK, Cyrillic, etc.) correctly. You output ONLY the final translated text — nothing else.`;
}

// ─── Component ────────────────────────────────────────────────────────────────

function TranslatorPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("Auto-detect");
  const [target, setTarget] = useState("Spanish");
  const [loading, setLoading] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "groq");

  // Auto-detect script from Unicode as user types (instant, no API call)
  useEffect(() => {
    if (!text.trim() || source !== "Auto-detect") { setDetectedLang(null); return; }
    const lang = detectScriptLanguage(text);
    setDetectedLang(lang);
  }, [text, source]);

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
      const from = isAutoDetect ? "Auto-detect" : source;

      const userPrompt  = buildTranslatePrompt(text, from, target, isAutoDetect);
      const systemPrompt = buildSystemPrompt(from, target);

      const res = await askAI(userPrompt, systemPrompt);

      // Strip common AI wrapper artefacts
      let translated = res.text.trim();
      translated = translated.replace(/^["']|["']$/g, "");                  // wrapping quotes
      translated = translated.replace(/^Translation:\s*/i, "");             // "Translation:" prefix
      translated = translated.replace(/^(Translated text|Output):\s*/i, ""); // other prefixes
      translated = translated.trim();

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

  async function detect() {
    if (!text.trim()) return toast.error("Type something first");
    setLoading(true);
    try {
      // First try instant Unicode detection
      const scriptLang = detectScriptLanguage(text);
      if (scriptLang) {
        if (LANGS.includes(scriptLang)) { setSource(scriptLang); toast.success(`Detected: ${scriptLang} (Unicode script)`); }
        setLoading(false); return;
      }
      // Fallback to LLM
      const res = await askAI(
        `Identify the language of the following text. Reply with ONE WORD only — the English name of the language (e.g. "English", "Nepali", "Spanish"). Do not add any punctuation or explanation.\n\n${text}`,
        "You are a language identification expert. Return only the language name as a single word."
      );
      const lang = res.text.trim().split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
      if (LANGS.includes(lang)) { setSource(lang); toast.success(`Detected: ${lang}`); }
      else toast.message(`Detected: ${res.text.trim()}`);
    } finally {
      setLoading(false);
    }
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); translate(); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Languages className="h-6 w-6 text-violet-600" /> Universal Translator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            30+ languages · Nepali Unicode · Auto-detect · Listen &amp; save · Powered by Bishal's Assistant
          </p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Feature highlights */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          "✅ Nepali Unicode (देवनागरी)",
          "✅ Romanized input (e.g. 'mero naam')",
          "✅ Context-aware & natural",
          "✅ Tone & register preserved",
        ].map(f => (
          <span key={f} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700">{f}</span>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        {/* Language selectors */}
        <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex flex-col gap-1">
            <select value={source} onChange={(e) => { setSource(e.target.value); setDetectedLang(null); }}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium">
              {LANGS.map((l) => <option key={l}>{l}</option>)}
            </select>
            {/* Unicode script hint */}
            {detectedLang && source === "Auto-detect" && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-violet-600">
                  📝 Detected script: <strong>{detectedLang}</strong>
                </span>
                <button onClick={() => setSource(detectedLang)}
                  className="text-[11px] text-violet-500 underline hover:text-violet-700">
                  Use as source
                </button>
              </div>
            )}
          </div>
          <button onClick={swap} title="Swap languages"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-white hover:bg-accent self-start">
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium self-start">
            {LANGS.filter((l) => l !== "Auto-detect").map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>

        {/* Text panels */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Source */}
          <div className="rounded-xl border border-border bg-slate-50/50 p-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              rows={9}
              placeholder={`Type or paste text… Nepali Unicode (मेरो नाम…) and romanized (mero naam…) both supported.\n\nCtrl+Enter to translate.`}
              className="w-full resize-none bg-transparent text-sm outline-none"
              style={{ fontFamily: "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif" }}
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

          {/* Translation output */}
          <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
            {loading ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                <div className="text-center">
                  <p className="font-medium text-violet-700">Translating…</p>
                  <p className="text-xs">Processing {source === "Auto-detect" ? "source" : source} → {target}</p>
                </div>
              </div>
            ) : (
              <textarea
                readOnly
                value={result}
                rows={9}
                placeholder="Translation will appear here…"
                className="w-full resize-none bg-transparent text-sm outline-none"
                style={{ fontFamily: "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif" }}
              />
            )}
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {loading ? "Translating…" : "Translate"} <span className="ml-1 text-[11px] font-normal opacity-70">Ctrl+Enter</span>
        </button>
      </div>

      {/* Translation History */}
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
                  <p className="mt-1 line-clamp-1 text-sm" style={{ fontFamily: "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif" }}>{h.original_text}</p>
                  <p className="line-clamp-1 text-sm font-medium text-violet-700" style={{ fontFamily: "'Noto Sans Devanagari', 'Noto Sans', system-ui, sans-serif" }}>{h.translated_text}</p>
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
