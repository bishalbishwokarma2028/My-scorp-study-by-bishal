import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Shuffle, Check, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import { canUseAI, bumpAIUsage, QUOTA_MSG, getAIUsedToday, AI_DAILY_LIMIT } from "@/lib/dailyLimits";

export const Route = createFileRoute("/_authenticated/dashboard/flashcards")({
  component: FlashcardsPage,
});

type Card = { front: string; back: string };
type Mode = "flip" | "match" | "type";

function FlashcardsPage() {
  const { user } = Route.useRouteContext();
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [mode, setMode] = useState<Mode>("flip");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [matches, setMatches] = useState<{ q: number; a: number }[]>([]);
  const [selQ, setSelQ] = useState<number | null>(null);

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
    if (!canUseAI()) return toast.error(QUOTA_MSG);
    setLoading(true);
    bumpAIUsage();
    const prompt = `Create ${count} flashcards for studying: "${topic}". Return STRICT JSON array: [{"front":"question or term","back":"answer or definition"}]. No prose.`;
    const res = await askAI(prompt, "Output JSON only.");
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

  if (!cards) {
    return (
      <div className="card-soft mx-auto max-w-xl space-y-4 p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Make flashcards</h2>
        <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={4} placeholder="Topic or notes to study..." className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
        <select value={count} onChange={(e) => setCount(+e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
          {[5, 10, 15, 20].map((n) => <option key={n}>{n} cards</option>)}
        </select>
        <button onClick={generate} disabled={loading} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Bishal's Assistant is thinking…</> : "Generate"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-soft flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex gap-2">
          {(["flip", "match", "type"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setIdx(0); setFlipped(false); setMatches([]); }} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${mode === m ? "bg-primary text-primary-foreground" : "bg-accent"}`}>{m}</button>
          ))}
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
            <div className={`flip-inner relative h-64 w-full rounded-2xl ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
              <div className="flip-face absolute inset-0 grid place-items-center rounded-2xl bg-primary p-6 text-center text-primary-foreground card-soft">
                <p className="text-xl font-semibold">{cards[idx].front}</p>
              </div>
              <div className="flip-face absolute inset-0 grid place-items-center rounded-2xl bg-card p-6 text-center [transform:rotateY(180deg)] card-soft">
                <p className="text-lg">{cards[idx].back}</p>
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
          <p className="my-4 text-xl font-semibold">{cards[idx].front}</p>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
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
