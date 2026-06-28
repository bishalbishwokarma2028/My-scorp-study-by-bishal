import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Save, Wand2, RefreshCw, Trash2, Image as ImageIcon, Sparkles, GraduationCap, Camera, BarChart3, Palette, Hammer, Landmark } from "lucide-react";
import { toast } from "sonner";
import { askAI } from "@/lib/aiProvider";
import { supabase } from "@/integrations/supabase/client";
import { canUseAI, bumpAIUsage, canGenerateImage, bumpImageUsage, getImageUsedToday, IMAGE_DAILY_LIMIT, QUOTA_MSG } from "@/lib/dailyLimits";

export const Route = createFileRoute("/_authenticated/dashboard/image-gen")({
  component: ImageGenPage,
});

const STYLES = [
  { key: "Educational", icon: GraduationCap, grad: "from-violet-500 to-fuchsia-500" },
  { key: "Realistic", icon: Camera, grad: "from-slate-500 to-slate-700" },
  { key: "Diagram", icon: BarChart3, grad: "from-blue-500 to-cyan-500" },
  { key: "Cartoon", icon: Palette, grad: "from-amber-500 to-orange-500" },
  { key: "Blueprint", icon: Hammer, grad: "from-sky-500 to-blue-600" },
  { key: "Historical", icon: Landmark, grad: "from-amber-700 to-stone-700" },
] as const;

const PROMPT_CHIPS = [
  "Human heart anatomy with labeled chambers",
  "Plant cell structure diagram",
  "Solar system to scale",
  "Mitosis stages step by step",
  "Roman Colosseum in its prime",
  "Newton's laws of motion illustrated",
  "Water cycle diagram",
  "DNA double helix structure",
];

const DAILY_LIMIT = 3;

function ImageGenPage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<(typeof STYLES)[number]["key"]>("Educational");
  const [url, setUrl] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usedToday, setUsedToday] = useState(0);

  useEffect(() => {
    setUsedToday(getImageUsedToday());
    try {
      const raw = sessionStorage.getItem("scorp_restore");
      if (!raw) return;
      const item = JSON.parse(raw);
      if (item.type !== "Image") return;
      sessionStorage.removeItem("scorp_restore");
      if (item.prompt) setPrompt(item.prompt);
    } catch { /* silent */ }
  }, []);

  const left = Math.max(0, IMAGE_DAILY_LIMIT - usedToday);

  async function generate(useText?: string) {
    const base = (useText ?? prompt).trim();
    if (!base) return toast.error("Enter a prompt or pick a suggestion");
    if (!canGenerateImage()) return toast.error("You've reached your 3 images/day limit. Try again Tomorrow!");
    if (!canUseAI()) return toast.error(QUOTA_MSG);

    setLoading(true);
    setUrl(null);
    setEnhanced(null);

    // 1) Enhance prompt with AI
    const enh = await askAI(
      `Rewrite this image prompt for an AI image generator. Make it vivid, accurate, and educational. One sentence, no quotes. Style: ${style}. Original: "${base}"`,
      "You output only the improved prompt, nothing else."
    );
    const improved = enh.text.replace(/^["']|["']$/g, "").trim() || base;
    setEnhanced(improved);

    const full = `${improved}, ${style} style`;
    const u = `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=1024&height=1024&model=flux&nologo=true&seed=${Date.now()}`;
    await new Promise<void>((resolve) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => resolve(); img.src = u; });
    setUrl(u);
    bumpImageUsage();
    bumpAIUsage();
    setUsedToday(getImageUsedToday());
    setLoading(false);
  }

  async function save() {
    if (!url) return;
    const { error } = await supabase.from("generated_images").insert({ user_id: user.id, prompt: enhanced ?? prompt, image_url: url, style });
    if (error) return toast.error(error.message);
    toast.success("Saved to gallery");
    qc.invalidateQueries({ queryKey: ["gallery"] });
  }

  const { data: gallery } = useQuery({
    queryKey: ["gallery", user.id],
    queryFn: async () => (await supabase.from("generated_images").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function del(id: string) {
    await supabase.from("generated_images").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["gallery"] });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ImageIcon className="h-6 w-6 text-fuchsia-600" /> Image Generator
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">AI-enhanced educational visuals — prompt gets automatically improved before generating.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-700">
          <ImageIcon className="h-3.5 w-3.5" /> {left} images left today
        </span>
      </div>

      {/* Prompt card */}
      <div className="rounded-2xl border border-border bg-white p-6">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe what you want to visualize... e.g. 'human heart with labeled chambers', 'solar system diagram'"
          className="w-full resize-none rounded-xl border border-border bg-slate-50/40 p-4 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
        />

        {/* Suggestion chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {PROMPT_CHIPS.map((c) => (
            <button key={c} onClick={() => setPrompt(c)} className="rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700">{c}</button>
          ))}
        </div>

        {/* Style + generate */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {STYLES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStyle(s.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${style === s.key ? "border-violet-300 bg-violet-50 text-violet-700" : "border-border bg-white text-muted-foreground hover:bg-accent"}`}
            >
              <s.icon className="h-3.5 w-3.5" /> {s.key}
            </button>
          ))}
          <button onClick={() => generate()} disabled={loading || left <= 0} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate Image
          </button>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-2xl border border-border bg-white p-6">
        {loading ? (
          <div className="grid place-items-center py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
            <p className="mt-4 text-sm text-muted-foreground">Enhancing prompt & generating image…</p>
            {enhanced && <p className="mt-2 max-w-md text-xs italic text-muted-foreground">"{enhanced}"</p>}
          </div>
        ) : url ? (
          <div>
            {enhanced && (
              <div className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                <span className="font-semibold">✨ AI-enhanced prompt:</span> {enhanced}
              </div>
            )}
            <img src={url} alt={prompt} className="mx-auto max-h-[600px] rounded-xl border border-border" />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href={url} download className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"><Download className="h-3.5 w-3.5" /> Download</a>
              <button onClick={() => generate(enhanced ?? prompt)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium hover:bg-accent"><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
              <button onClick={save} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-xs font-medium hover:bg-accent"><Save className="h-3.5 w-3.5" /> Save to gallery</button>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center py-20 text-center">
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <ImageIcon className="h-10 w-10" />
            </div>
            <p className="mt-4 font-semibold">No image yet</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">Enter a description and click Generate. Your prompt will be automatically enhanced by Bishal's Assistant for best results.</p>
          </div>
        )}
      </div>

      {/* Gallery */}
      {gallery && gallery.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><Sparkles className="h-4 w-4 text-violet-600" /> Your gallery</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g) => (
              <div key={g.id} className="group relative">
                <img src={g.image_url!} alt={g.prompt!} className="aspect-square w-full rounded-xl border border-border object-cover" />
                <button onClick={() => del(g.id)} className="absolute right-2 top-2 hidden rounded-md bg-destructive p-1.5 text-destructive-foreground group-hover:block"><Trash2 className="h-3 w-3" /></button>
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{g.prompt}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
