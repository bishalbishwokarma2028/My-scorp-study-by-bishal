import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ChevronRight, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";

export const Route = createFileRoute("/_authenticated/dashboard/science")({
  component: SciencePage,
});

type ScienceData = {
  topic: string;
  subject: string;
  introduction: string;
  key_concepts: { term: string; definition: string }[];
  explanation: string;
  examples: { title: string; description: string }[];
  experiment_or_application: { title: string; description: string; steps: string[] };
  practice_questions: { question: string; answer: string }[];
  fun_fact: string;
};

const SCIENCE_SUBJECTS = [
  {
    subject: "Physics", icon: "⚛️", color: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200",
    chapters: [
      { name: "Mechanics", topics: ["Motion & Kinematics", "Newton's Laws of Motion", "Friction", "Work, Energy & Power", "Momentum & Collisions", "Circular Motion", "Gravitation", "Simple Harmonic Motion"] },
      { name: "Thermodynamics", topics: ["Temperature & Heat", "First Law of Thermodynamics", "Second Law & Entropy", "Heat Transfer (Conduction, Convection, Radiation)", "Thermal Expansion", "Ideal Gas Laws"] },
      { name: "Waves & Sound", topics: ["Wave Properties", "Sound Waves", "Resonance & Echo", "Doppler Effect", "Standing Waves", "Interference & Superposition"] },
      { name: "Light & Optics", topics: ["Reflection of Light", "Refraction & Snell's Law", "Lenses & Mirrors", "Total Internal Reflection", "Dispersion & Spectrum", "Interference & Diffraction"] },
      { name: "Electricity & Magnetism", topics: ["Electric Charge & Fields", "Current, Voltage & Resistance", "Ohm's Law & Circuits", "Series & Parallel Circuits", "Magnetic Fields", "Electromagnetic Induction", "AC & DC"] },
      { name: "Modern Physics", topics: ["Atomic Models", "Radioactivity & Decay", "Nuclear Fission & Fusion", "Photoelectric Effect", "Wave-Particle Duality", "Special Relativity Basics"] },
    ],
  },
  {
    subject: "Chemistry", icon: "🧪", color: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",
    chapters: [
      { name: "Atomic Structure", topics: ["Atomic Models (Bohr, Quantum)", "Subatomic Particles", "Electron Configuration", "Isotopes & Ions", "Quantum Numbers", "Periodic Trends"] },
      { name: "Periodic Table", topics: ["Groups & Periods", "Alkali & Alkaline Earth Metals", "Transition Metals", "Halogens & Noble Gases", "Properties & Reactivity Trends"] },
      { name: "Chemical Bonding", topics: ["Ionic Bonds", "Covalent Bonds", "Metallic Bonds", "Intermolecular Forces", "VSEPR Theory & Molecular Shape", "Electronegativity & Polarity"] },
      { name: "Chemical Reactions", topics: ["Types of Reactions", "Balancing Chemical Equations", "Stoichiometry", "Limiting Reagent & Excess", "Reaction Rates & Activation Energy", "Enthalpy & Exo/Endothermic Reactions"] },
      { name: "Acids & Bases", topics: ["pH Scale & Indicators", "Arrhenius Theory", "Brønsted-Lowry Theory", "Neutralisation Reactions", "Strong vs Weak Acids", "Titration", "Buffers"] },
      { name: "Organic Chemistry", topics: ["Hydrocarbons (Alkanes, Alkenes, Alkynes)", "Functional Groups", "Alcohols & Ethers", "Carboxylic Acids & Esters", "Polymerisation", "Isomers"] },
    ],
  },
  {
    subject: "Biology", icon: "🦠", color: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-200",
    chapters: [
      { name: "Cell Biology", topics: ["Cell Theory", "Prokaryotic vs Eukaryotic Cells", "Cell Organelles & Functions", "Cell Membrane & Transport", "Mitosis & Cell Division", "Meiosis & Sexual Reproduction"] },
      { name: "Genetics", topics: ["DNA Structure & Replication", "Transcription & Translation", "Mendelian Genetics & Punnett Squares", "Dominant & Recessive Traits", "Mutations", "Genetic Engineering & GMOs"] },
      { name: "Evolution", topics: ["Natural Selection", "Adaptations", "Evidence for Evolution", "Speciation", "Phylogenetics & Classification", "Human Evolution"] },
      { name: "Human Body", topics: ["Digestive System", "Respiratory System", "Circulatory System & Heart", "Nervous System & Brain", "Endocrine System & Hormones", "Immune System", "Reproductive System", "Musculoskeletal System"] },
      { name: "Ecology", topics: ["Ecosystems & Biomes", "Food Chains & Food Webs", "Energy Flow & Trophic Levels", "Carbon Cycle", "Nitrogen Cycle", "Population Dynamics", "Biodiversity & Conservation"] },
      { name: "Plant Biology", topics: ["Plant Cell Structure", "Photosynthesis", "Cellular Respiration", "Plant Reproduction", "Transport in Plants (Xylem & Phloem)", "Plant Tropisms & Hormones"] },
    ],
  },
  {
    subject: "Earth Science", icon: "🌍", color: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200",
    chapters: [
      { name: "Earth's Structure", topics: ["Layers of the Earth (Crust, Mantle, Core)", "Types of Rocks (Igneous, Sedimentary, Metamorphic)", "The Rock Cycle", "Soil Formation & Composition", "Minerals & Their Properties"] },
      { name: "Plate Tectonics", topics: ["Continental Drift Theory", "Tectonic Plates & Boundaries", "Earthquakes & Seismic Waves", "Volcanoes", "Mountain Formation", "Tsunamis"] },
      { name: "Atmosphere & Weather", topics: ["Layers of the Atmosphere", "Weather vs Climate", "Cloud Formation & Types", "Precipitation", "Wind Systems & Pressure", "Storms & Cyclones"] },
      { name: "Climate", topics: ["Climate Zones & Biomes", "The Greenhouse Effect", "Global Warming & Climate Change", "Ocean Currents & El Niño", "Human Impact on Environment"] },
      { name: "The Solar System", topics: ["The Sun & Solar Energy", "Inner Planets", "Outer Planets", "Asteroids, Comets & Meteors", "The Moon & Tides", "Stars & The Life Cycle of Stars", "Galaxies & The Universe"] },
    ],
  },
];

function buildSciencePrompt(topic: string, subject: string): string {
  return `Teach the science topic "${topic}" from ${subject}.

Return STRICT JSON only — no prose, no markdown fences:
{
  "topic": "${topic}",
  "subject": "${subject}",
  "introduction": "Engaging 2-3 sentence introduction that sparks curiosity",
  "key_concepts": [
    {"term": "Key term or concept", "definition": "Clear, student-friendly definition (1 sentence)"},
    {"term": "Term 2", "definition": "Definition 2"},
    {"term": "Term 3", "definition": "Definition 3"},
    {"term": "Term 4", "definition": "Definition 4"},
    {"term": "Term 5", "definition": "Definition 5"}
  ],
  "explanation": "Detailed, clear explanation of the topic (4-6 sentences). Include the 'how' and 'why', not just the 'what'.",
  "examples": [
    {"title": "Example title", "description": "2-3 sentence description of a concrete, relatable example"},
    {"title": "Example 2", "description": "Another example, ideally from everyday life"},
    {"title": "Example 3", "description": "A third example or application"}
  ],
  "experiment_or_application": {
    "title": "Name of a simple experiment, lab activity, or real-world application",
    "description": "Brief overview of what this demonstrates (1-2 sentences)",
    "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ...", "Step 4: ...", "Step 5: ..."]
  },
  "practice_questions": [
    {"question": "A short-answer practice question", "answer": "Model answer (1-3 sentences)"},
    {"question": "Question 2", "answer": "Answer 2"},
    {"question": "Question 3 (harder / application-based)", "answer": "Answer 3"},
    {"question": "Question 4", "answer": "Answer 4"}
  ],
  "fun_fact": "A surprising, memorable fun fact about this topic that students will want to share"
}`;
}

function PracticeQuestion({ q, index }: { q: ScienceData["practice_questions"][0]; index: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-2">
      <div className="flex items-start gap-2">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        <p className="text-sm font-medium">{q.question}</p>
      </div>
      <button onClick={() => setShow(!show)} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {show ? "Hide Answer" : "Show Answer"}
      </button>
      {show && <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm text-emerald-800 leading-relaxed">{q.answer}</p>}
    </div>
  );
}

function SciencePage() {
  const { user } = Route.useRouteContext();
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0);
  const [openChapter, setOpenChapter] = useState<string | null>(SCIENCE_SUBJECTS[0].chapters[0].name);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [scienceData, setScienceData] = useState<ScienceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "science");

  const activeSubject = SCIENCE_SUBJECTS[activeSubjectIdx];

  function switchSubject(i: number) {
    setActiveSubjectIdx(i);
    setOpenChapter(SCIENCE_SUBJECTS[i].chapters[0].name);
    setSelectedTopic(null);
    setScienceData(null);
  }

  async function selectTopic(topic: string) {
    if (topic === selectedTopic) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    setSelectedTopic(topic);
    setScienceData(null);
    setLoading(true);
    const res = await askAI(
      buildSciencePrompt(topic, activeSubject.subject),
      "You are a science teacher. Return ONLY valid JSON — no markdown, no prose.",
    );
    setProvider(res.provider);
    await bump();
    const parsed = extractJSON<ScienceData>(res.text);
    if (parsed) {
      setScienceData(parsed);
    } else {
      toast.error("Could not load topic — please try again");
      setSelectedTopic(null);
    }
    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Science</h2>
          <p className="text-sm text-muted-foreground">Physics, Chemistry, Biology & Earth Science — fully explained</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Subject tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SCIENCE_SUBJECTS.map(({ subject, icon, color }, i) => (
          <button
            key={subject}
            onClick={() => switchSubject(i)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeSubjectIdx === i ? `${color} text-white shadow-sm` : "border border-border bg-background hover:bg-accent"}`}
          >
            {icon} {subject}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className={`border-b border-border px-4 py-2.5 ${activeSubject.light}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text}`}>{activeSubject.icon} {activeSubject.subject}</p>
            </div>
            <nav className="max-h-[55vh] overflow-y-auto lg:max-h-[calc(100vh-17rem)]">
              {activeSubject.chapters.map(({ name, topics }) => (
                <div key={name}>
                  <button
                    onClick={() => setOpenChapter(openChapter === name ? null : name)}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-4 py-2.5 text-left text-xs font-bold hover:bg-accent"
                  >
                    <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded ${activeSubject.color} text-[9px] text-white`}>
                      {openChapter === name ? "−" : "+"}
                    </span>
                    <span className="flex-1 truncate">{name}</span>
                  </button>
                  {openChapter === name && (
                    <div className={`border-b border-border/40 ${activeSubject.light}/30`}>
                      {topics.map((topic) => (
                        <button
                          key={topic}
                          onClick={() => selectTopic(topic)}
                          className={`flex w-full items-center gap-2 px-5 py-2 text-left text-xs transition-colors ${selectedTopic === topic ? `${activeSubject.color} text-white font-semibold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                        >
                          {selectedTopic === topic ? <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-white" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />}
                          <span className="truncate">{topic}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {!selectedTopic ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-5xl">{activeSubject.icon}</div>
              <div>
                <p className="font-semibold">{activeSubject.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">Select a topic from the sidebar to get a full explanation with examples, experiments, and practice questions</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {activeSubject.chapters[0].topics.slice(0, 4).map((t) => (
                  <button key={t} onClick={() => { setOpenChapter(activeSubject.chapters[0].name); selectTopic(t); }} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : loading ? (
            <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading {selectedTopic}…</p>
            </div>
          ) : scienceData ? (
            <div className="space-y-4">
              {/* Header banner */}
              <div className={`rounded-2xl ${activeSubject.color} p-5 text-white`}>
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{scienceData.subject}</p>
                <h3 className="mt-1 text-xl font-bold">{scienceData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{scienceData.introduction}</p>
                <div className="mt-3">
                  <ProviderBadge provider={provider} />
                </div>
              </div>

              {/* Key concepts */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🔑 Key Concepts</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {scienceData.key_concepts.map((c, i) => (
                    <div key={i} className={`rounded-xl ${activeSubject.light} ${activeSubject.border} border p-3`}>
                      <p className={`text-xs font-bold ${activeSubject.text}`}>{c.term}</p>
                      <p className="mt-0.5 text-xs text-foreground/70 leading-relaxed">{c.definition}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Explanation */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📖 Explanation</h4>
                <p className="text-sm leading-relaxed text-foreground/90">{scienceData.explanation}</p>
              </div>

              {/* Examples */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🌟 Real-World Examples</h4>
                <div className="space-y-3">
                  {scienceData.examples.map((ex, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
                      <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${activeSubject.color} text-sm text-white`}>
                        {["🔬", "🔭", "💡"][i] || "🧩"}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{ex.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{ex.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Experiment / Application */}
              <div className={`rounded-2xl border ${activeSubject.border} ${activeSubject.light} p-4 sm:p-5`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🧫</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text}`}>Experiment / Application</p>
                    <p className="mt-1 font-bold text-foreground">{scienceData.experiment_or_application.title}</p>
                    <p className="mt-1 text-sm text-foreground/80">{scienceData.experiment_or_application.description}</p>
                    <ol className="mt-3 space-y-1.5">
                      {scienceData.experiment_or_application.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                          <span className={`mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full ${activeSubject.color} text-[9px] font-bold text-white`}>{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* Practice questions */}
              <div className="card-soft p-4 sm:p-5 space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">✏️ Practice Questions</h4>
                {scienceData.practice_questions.map((q, i) => <PracticeQuestion key={i} q={q} index={i} />)}
              </div>

              {/* Fun fact */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700 mb-1">🤩 Fun Fact</p>
                <p className="text-sm text-amber-900">{scienceData.fun_fact}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
