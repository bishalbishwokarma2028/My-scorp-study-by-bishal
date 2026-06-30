import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Shuffle, Check, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/flashcards")({
  component: FlashcardsPage,
});

type Card = { front: string; back: string };
type Mode = "flip" | "match" | "type";
type CardType = "Term / Definition" | "Very Short Answer" | "Short Answer" | "Long Answer";

const CARD_TYPE_INFO: Record<CardType, { icon: string; desc: string; frontLabel: string; backLabel: string }> = {
  "Term / Definition":   { icon: "📚", desc: "Classic flashcards — term on front, definition on back.", frontLabel: "Term", backLabel: "Definition" },
  "Very Short Answer":   { icon: "⚡", desc: "Question on front, 1–5 word answer on back.", frontLabel: "Question", backLabel: "Answer (1–5 words)" },
  "Short Answer":        { icon: "✏️", desc: "Question on front, 1–3 sentence answer on back.", frontLabel: "Question", backLabel: "Short Answer" },
  "Long Answer":         { icon: "📝", desc: "Question on front, detailed paragraph answer on back.", frontLabel: "Question", backLabel: "Detailed Answer" },
};

function buildFlashcardPrompt(topic: string, count: number, cardType: CardType): string {
  if (cardType === "Term / Definition") {
    return `Create exactly ${count} Term/Definition flashcards for studying: "${topic}".
STRICT RULES:
- "front" must be a key term, concept, or keyword — NOT a question.
- "back" must be a clear, concise definition of that term (1–3 sentences).
Return STRICT JSON array only — no prose, no markdown fences:
[{"front":"term or concept","back":"definition of the term"}]`;
  }
  if (cardType === "Very Short Answer") {
    return `Create exactly ${count} Very Short Answer flashcards for: "${topic}".
STRICT RULES:
- "front" must be a question (ending with "?").
- "back" must be the answer in 1–5 words ONLY — a key fact, date, name, number, or term. No full sentences.
Return STRICT JSON array only — no prose, no markdown fences:
[{"front":"question?","back":"1-5 word answer"}]`;
  }
  if (cardType === "Short Answer") {
    return `Create exactly ${count} Short Answer flashcards for: "${topic}".
STRICT RULES:
- "front" must be a question (ending with "?").
- "back" must be a complete answer in 1–3 sentences. Not a single word. Not a paragraph.
Return STRICT JSON array only — no prose, no markdown fences:
[{"front":"question?","back":"1-3 sentence answer"}]`;
  }
  return `Create exactly ${count} Long Answer flashcards for: "${topic}".
STRICT RULES:
- "front" must be a detailed question (ending with "?") asking for an in-depth explanation.
- "back" must be a comprehensive paragraph of 6–10 sentences covering key concepts, how it works, examples, and significance.
Return STRICT JSON array only — no prose, no markdown fences:
[{"front":"detailed question?","back":"comprehensive 6-10 sentence paragraph answer"}]`;
}

function FlashcardsPage() {
  const { user } = Route.useRouteContext();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [cardType, setCardType] = useState<CardType>("Term / Definition");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [mode, setMode] = useState<Mode>("flip");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [matches, setMatches] = useState<{ q: number; a: number }[]>([]);
  const [selQ, setSelQ] = useState<number | null>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "flashcards");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("scorp_restore");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.type !== "Flashcard") return;
      sessionStorage.removeItem("scorp_restore");
      if (item.topic) setTopic(item.topic);
    } catch { /* silent */ }
  }, []);

  async function generate() {
    if (!topic.trim()) return toast.error("Topic required");
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setLoading(true);
    const prompt = buildFlashcardPrompt(topic, count, cardType);
    const res = await askAI(prompt, "Output JSON only.");
    await bump();
    const parsed = extractJSON<Card[]>(res.text);
    if (parsed && parsed.length) {
      setCards(parsed); setIdx(0); setFlipped(false); setKnown(new Set()); setTyped(""); setMatches([]);
    } else toast.error("Could not generate, try again");
    setLoading(false);
  }

  function next() { if (cards) { setIdx((idx + 1) % cards.length); setFlipped(false); setTyped(""); } }
  function shuffle() { if (cards) { setCards([...cards].sort(() => Math.random() - 0.5)); setIdx(0); setFlipped(false); } }

  async function save() {
    if (!cards) return;
    const { error } = await supabase.from("flashcards").insert({ user_id: user.id, topic, cards: cards as never });
    if (error) return toast.error(error.message);
    toast.success("Set saved");
  }

  async function checkTyped() {
    if (!cards) return;
    const correct = cards[idx].back.trim().toLowerCase();
    const prompt = `Is the answer "${typed}" semantically equivalent to "${cards[idx].back}"? Reply only YES or NO.`;
    const res = await askAI(prompt, "Reply with one word only.");
    const isCorrect = res.text.toLowerCase().includes("yes") || typed.trim().toLowerCase() === correct;
    if (isCorrect) { toast.success("Correct!"); setKnown(new Set([...known, idx])); }
    else toast.error(`Not quite. Answer: ${cards[idx].back}`);
    setTimeout(next, 1200);
  }

  const info = CARD_TYPE_INFO[cardType];

  if (!cards) {
    return (
      <div className="card-soft mx-auto max-w-xl space-y-5 p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Make flashcards</h2>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="Topic or notes to study..." className="w-full rounded-lg border border-input bg-background p-3 text-sm" />

        <div>
          <label className="text-xs font-medium text-muted-foreground">Card Type</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(Object.keys(CARD_TYPE_INFO) as CardType[]).map((ct) => {
              const ci = CARD_TYPE_INFO[ct];
              return (
                <button
                  key={ct}
                  onClick={() => setCardType(ct)}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${cardType === ct ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}
                >
                  <span className="text-base">{ci.icon}</span>
                  <div>
                    <p className={`text-xs font-semibold ${cardType === ct ? "text-primary" : ""}`}>{ct}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{ci.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <select value={count} onChange={(e) => setCount(+e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {[5, 10, 15, 20].map((n) => <option key={n}>{n} cards</option>)}
        </select>

        <button onClick={generate} disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Bishal's Assistant is thinking…</> : "Generate"}
        </button>
      </div>
    );
  }

  const isLongAnswer = cardType === "Long Answer";

  return (
    <div className="space-y-4">
      <div className="card-soft flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">{info.icon}</span>
          <span className="text-xs font-semibold text-muted-foreground">{cardType}</span>
          <div className="flex gap-1.5">
            {(["flip", "match", "type"] as Mode[]).map((m) => (
              <button key={m} onClick={() => { setMode(m); setIdx(0); setFlipped(false); setMatches([]); }} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${mode === m ? "bg-primary text-primary-foreground" : "bg-accent"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Known: <strong className="text-success">{known.size}</strong> / {cards.length}</span>
          <button onClick={shuffle} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-accent"><Shuffle className="h-3 w-3" /> Shuffle</button>
          <button onClick={save} className="rounded-md border border-border px-2 py-1 hover:bg-accent">Save set</button>
          <button onClick={() => setCards(null)} className="rounded-md border border-border px-2 py-1 hover:bg-accent">New set</button>
        </div>
      </div>

      {mode === "flip" && (
        <div className="mx-auto max-w-xl">
          <div onClick={() => setFlipped(!flipped)} className="flip-card cursor-pointer">
            <div className={`flip-inner relative w-full rounded-2xl ${isLongAnswer ? "min-h-[200px]" : "h-64"} ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
              <div className="flip-face absolute inset-0 grid place-items-center rounded-2xl bg-primary p-6 text-center text-primary-foreground card-soft">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-70 mb-2">{info.frontLabel}</p>
                  <p className="text-xl font-semibold">{cards[idx].front}</p>
                </div>
              </div>
              <div className={`flip-face absolute inset-0 grid ${isLongAnswer ? "items-start pt-5" : "place-items-center"} rounded-2xl bg-card p-6 text-center [transform:rotateY(180deg)] card-soft overflow-y-auto`}>
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-50 mb-2">{info.backLabel}</p>
                  <p className={isLongAnswer ? "text-sm text-left leading-relaxed" : "text-lg"}>{cards[idx].back}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button onClick={() => { setKnown(new Set([...known, idx])); next(); }} className="rounded-lg bg-success px-4 py-2 text-sm text-success-foreground">Know it</button>
            <span className="self-center text-sm text-muted-foreground">{idx + 1} / {cards.length}</span>
            <button onClick={next} className="rounded-lg border border-border px-4 py-2 text-sm"><RotateCw className="mr-1 inline h-3 w-3" /> Still learning</button>
          </div>
        </div>
      )}

      {mode === "type" && (
        <div className="card-soft mx-auto max-w-xl p-6 text-center">
          <p className="text-sm text-muted-foreground">{idx + 1} / {cards.length}</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mt-1">{info.frontLabel}</p>
          <p className="my-4 text-xl font-semibold">{cards[idx].front}</p>
          {isLongAnswer ? (
            <textarea value={typed} onChange={(e) => setTyped(e.target.value)} rows={5} placeholder="Write your detailed answer…" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none text-left" />
          ) : (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          )}
          <button onClick={checkTyped} disabled={!typed} className="mt-3 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Check</button>
        </div>
      )}

      {mode === "match" && <MatchMode cards={cards} matches={matches} setMatches={setMatches} selQ={selQ} setSelQ={setSelQ} />}
    </div>
  );
}

function MatchMode({ cards, matches, setMatches, selQ, setSelQ }: {
  cards: Card[]; matches: { q: number; a: number }[]; setMatches: (m: { q: number; a: number }[]) => void;
  selQ: number | null; setSelQ: (n: number | null) => void;
}) {
  const subset = useMemo(() => cards.slice(0, 6), [cards]);
  const shuffledAnswers = useMemo(() => subset.map((_, i) => i).sort(() => 0.5 - Math.random()), [subset]);
  const isMatched = (q: number) => matches.some((m) => m.q === q);
  function pickAnswer(a: number) {
    if (selQ === null) return;
    setMatches([...matches, { q: selQ, a }]);
    setSelQ(null);
    if (matches.length + 1 === subset.length) toast.success("All matched!");
  }
  return (
    <div className="card-soft mx-auto grid max-w-3xl gap-4 p-6 sm:grid-cols-2">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Questions</p>
        {subset.map((c, i) => (
          <button key={i} disabled={isMatched(i)} onClick={() => setSelQ(i)} className={`block w-full rounded-lg border p-3 text-left text-sm ${isMatched(i) ? "border-success bg-success/10 line-through opacity-50" : selQ === i ? "border-primary bg-accent" : "border-border hover:bg-accent"}`}>
            {c.front}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Answers</p>
        {shuffledAnswers.map((ai) => {
          const matched = matches.find((m) => m.a === ai);
          const correct = matched && matched.q === ai;
          return (
            <button key={ai} disabled={!!matched} onClick={() => pickAnswer(ai)} className={`block w-full rounded-lg border p-3 text-left text-sm ${matched ? (correct ? "border-success bg-success/10" : "border-destructive bg-destructive/10") : "border-border hover:bg-accent"}`}>
              {subset[ai].back}{correct && <Check className="ml-2 inline h-3 w-3 text-success" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
