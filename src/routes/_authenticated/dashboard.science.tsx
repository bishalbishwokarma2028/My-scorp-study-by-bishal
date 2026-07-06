import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { usePageState } from "@/lib/pageState";
import { Loader2, ChevronRight, ChevronLeft, Eye, EyeOff, Send, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { askAI, extractJSON } from "@/lib/aiProvider";
import { useUsageLimit } from "@/hooks/useUsageLimit";
import { QUOTA_MESSAGE } from "@/lib/usageLimit.config";
import { QuotaBadge, ProviderBadge } from "@/components/ai-ui";
import { TypewriterText } from "@/components/TypewriterText";
import logo from "@/assets/scorpstudy-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard/science")({
  component: SciencePage,
});

type ScienceData = {
  topic: string;
  subject: string;
  introduction: string;
  key_concepts: { term: string; definition: string; example: string }[];
  explanation: { section: string; content: string }[];
  diagrams_description: string | null;
  equations: { name: string; equation: string; explanation: string }[];
  examples: { title: string; description: string; significance: string }[];
  experiment: { title: string; aim: string; materials: string[]; steps: string[]; expected_result: string; safety: string | null };
  practice_questions: { type: string; question: string; answer: string }[];
  connections: string[];
  fun_fact: string;
};

type AskMessage = { role: "user" | "assistant"; content: string; revealed?: boolean };

const SCIENCE_SUBJECTS = [
  {
    subject: "Physics", icon: "⚛️", color: "bg-blue-500", light: "bg-blue-50", text: "text-blue-700", border: "border-blue-200",
    chapters: [
      {
        name: "Mechanics", topics: [
          "Distance, Displacement & Speed", "Velocity & Acceleration", "Equations of Motion (SUVAT)",
          "Newton's First Law — Inertia", "Newton's Second Law — F = ma", "Newton's Third Law — Action & Reaction",
          "Types of Friction — Static & Kinetic", "Work, Energy & Work-Energy Theorem",
          "Kinetic & Potential Energy", "Conservation of Energy", "Power & Efficiency",
          "Momentum & Impulse", "Conservation of Momentum", "Elastic & Inelastic Collisions",
          "Circular Motion — Centripetal Force & Acceleration", "Universal Gravitation", "Satellite Motion & Orbits",
          "Simple Harmonic Motion", "Springs — Hooke's Law",
        ],
      },
      {
        name: "Thermodynamics", topics: [
          "Temperature, Heat & Internal Energy", "Specific Heat Capacity", "Latent Heat — Fusion & Vaporisation",
          "First Law of Thermodynamics", "Second Law & Entropy", "Heat Engines & Efficiency",
          "Conduction, Convection & Radiation", "Thermal Expansion", "Ideal Gas Law — PV = nRT",
          "Kinetic Theory of Gases", "Boyle's, Charles's & Gay-Lussac's Laws",
        ],
      },
      {
        name: "Waves & Sound", topics: [
          "Wave Properties — Amplitude, Frequency, Wavelength", "Transverse & Longitudinal Waves",
          "Wave Speed Equation — v = fλ", "Reflection & Refraction of Waves",
          "Diffraction & Interference", "Standing Waves & Resonance",
          "Sound Waves & Speed of Sound", "The Doppler Effect", "Ultrasound & Applications", "Noise & Decibels",
        ],
      },
      {
        name: "Light & Optics", topics: [
          "Properties of Light", "Reflection — Laws & Ray Diagrams", "Mirrors — Concave, Convex & Plane",
          "Refraction & Snell's Law", "Total Internal Reflection & Critical Angle",
          "Lenses — Concave & Convex", "Lens Formula & Magnification", "Optical Instruments",
          "Dispersion & The Spectrum", "Electromagnetic Spectrum",
        ],
      },
      {
        name: "Electricity & Magnetism", topics: [
          "Electric Charge & Coulomb's Law", "Electric Fields & Potential",
          "Current, Voltage & Resistance — Ohm's Law", "Resistors in Series & Parallel",
          "Power & Energy in Circuits", "Kirchhoff's Laws", "Capacitors",
          "Magnetic Fields & Flux", "Force on a Current-Carrying Conductor",
          "Electromagnetic Induction — Faraday's & Lenz's Law", "Transformers", "AC vs DC",
        ],
      },
      {
        name: "Modern Physics", topics: [
          "Photoelectric Effect", "Wave-Particle Duality", "de Broglie Wavelength",
          "Atomic Models — Thomson, Rutherford, Bohr", "Electron Energy Levels & Spectra",
          "Radioactivity — Alpha, Beta & Gamma", "Half-Life & Decay",
          "Nuclear Fission", "Nuclear Fusion", "Mass-Energy Equivalence E = mc²",
          "Special Relativity Basics",
        ],
      },
    ],
  },
  {
    subject: "Chemistry", icon: "🧪", color: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200",
    chapters: [
      {
        name: "Atomic Structure", topics: [
          "Subatomic Particles — Proton, Neutron, Electron", "Atomic Number & Mass Number",
          "Isotopes & Relative Atomic Mass", "Electron Configuration — Shells & Subshells",
          "Quantum Numbers — n, l, m, s", "Orbital Shapes — s, p, d, f",
          "Aufbau Principle, Hund's Rule & Pauli Exclusion", "Periodic Trends — Atomic Radius, Ionisation Energy, Electronegativity",
        ],
      },
      {
        name: "Periodic Table", topics: [
          "Structure of the Periodic Table", "Groups & Periods", "Alkali Metals — Group 1",
          "Alkaline Earth Metals — Group 2", "Transition Metals — Properties & Uses",
          "Halogens — Group 17", "Noble Gases — Group 18", "Metalloids & Semiconductors",
          "Trends Across a Period", "Trends Down a Group",
        ],
      },
      {
        name: "Chemical Bonding", topics: [
          "Ionic Bonding — Formation & Properties", "Covalent Bonding — Single, Double, Triple Bonds",
          "Dative (Coordinate) Covalent Bonds", "Metallic Bonding & Conductivity",
          "VSEPR Theory & Molecular Geometry", "Electronegativity & Bond Polarity",
          "Intermolecular Forces — Van der Waals, Dipole-Dipole, Hydrogen Bonds",
          "Giant Ionic vs Giant Covalent vs Molecular Structures",
        ],
      },
      {
        name: "Chemical Reactions", topics: [
          "Types of Reactions — Synthesis, Decomposition, Displacement", "Redox Reactions — OIL RIG",
          "Balancing Chemical Equations", "Mole Concept & Avogadro's Number",
          "Stoichiometry & Molar Ratios", "Limiting Reagent & Percentage Yield",
          "Reaction Rates — Factors Affecting Rate", "Activation Energy & Catalysts",
          "Enthalpy Changes — Exothermic & Endothermic", "Hess's Law",
          "Equilibrium & Le Chatelier's Principle",
        ],
      },
      {
        name: "Acids, Bases & Salts", topics: [
          "Arrhenius Theory", "Brønsted-Lowry Theory", "Lewis Theory",
          "Strong vs Weak Acids & Bases", "pH Scale & Calculations",
          "Ka, Kb & pKa", "Neutralisation Reactions", "Salt Formation",
          "Titration — Method & Calculations", "Indicators & pH Curves",
          "Buffers — How They Work", "Hydrolysis of Salts",
        ],
      },
      {
        name: "Organic Chemistry", topics: [
          "Hydrocarbons — Alkanes (IUPAC Naming)", "Alkenes — Structure & Reactions",
          "Alkynes", "Benzene & Aromaticity",
          "Alcohols — Types, Reactions & Uses", "Aldehydes & Ketones",
          "Carboxylic Acids & Esters — Esterification", "Amines & Amides",
          "Polymers — Addition & Condensation", "Isomerism — Structural & Stereoisomers",
          "Reaction Mechanisms — Substitution, Addition, Elimination",
        ],
      },
    ],
  },
  {
    subject: "Biology", icon: "🦠", color: "bg-violet-500", light: "bg-violet-50", text: "text-violet-700", border: "border-violet-200",
    chapters: [
      {
        name: "Cell Biology", topics: [
          "Cell Theory — 3 Principles", "Prokaryotic vs Eukaryotic Cells",
          "Animal Cell Organelles & Functions", "Plant Cell Organelles & Functions",
          "Cell Membrane — Fluid Mosaic Model", "Passive Transport — Diffusion & Osmosis",
          "Active Transport & Endocytosis", "Mitosis — All Stages & Purpose",
          "Meiosis — All Stages & Significance", "Cell Cycle — G1, S, G2, M",
          "Cancer — How It Develops", "Stem Cells — Types & Applications",
        ],
      },
      {
        name: "Genetics & Molecular Biology", topics: [
          "DNA Structure — Double Helix", "DNA Replication — Enzymes & Steps",
          "RNA Types — mRNA, tRNA, rRNA", "Transcription — Step by Step",
          "Translation — Codon Table & Ribosomes", "Gene Expression & Regulation",
          "Mutations — Types & Effects", "Mendelian Genetics — Monohybrid Cross",
          "Dihybrid Cross", "Sex-Linked Traits", "Codominance & Incomplete Dominance",
          "Pedigree Analysis", "Genetic Engineering — CRISPR & PCR",
          "Gel Electrophoresis",
        ],
      },
      {
        name: "Evolution & Classification", topics: [
          "Darwin's Theory of Natural Selection", "Evidence for Evolution — Fossil, Anatomical, Molecular",
          "Adaptations — Structural, Behavioural, Physiological", "Types of Speciation",
          "Hardy-Weinberg Equilibrium", "Phylogenetics & Cladograms",
          "Five Kingdom vs Three Domain Classification", "Binomial Nomenclature",
          "Viruses — Structure & Replication", "Bacteria — Types & Importance",
        ],
      },
      {
        name: "Human Body Systems", topics: [
          "Digestive System — Organs & Enzymes", "Absorption of Nutrients",
          "Respiratory System — Gas Exchange", "Breathing Mechanics",
          "Circulatory System — Heart Structure & Function", "Blood — Components & Functions",
          "Nervous System — Neurones & Synapses", "Reflex Arc",
          "Endocrine System — Hormones & Feedback", "Immune System — Innate & Adaptive",
          "Musculoskeletal System — Joints & Muscles", "Reproductive System",
          "Kidney — Filtration & Reabsorption", "Homeostasis — Temperature, Blood Glucose, Water",
        ],
      },
      {
        name: "Ecology", topics: [
          "Ecosystems — Biotic & Abiotic Factors", "Food Chains & Food Webs",
          "Energy Flow & Ecological Pyramids", "Carbon Cycle", "Nitrogen Cycle",
          "Water Cycle", "Population Ecology — Growth Models",
          "Interspecific Relationships — Predation, Competition, Mutualism",
          "Succession — Primary & Secondary", "Biomes of the World",
          "Biodiversity — Importance & Measurement", "Conservation Biology",
          "Human Impact — Deforestation, Pollution, Climate Change",
        ],
      },
      {
        name: "Plant Biology", topics: [
          "Plant Cell vs Animal Cell", "Photosynthesis — Light & Dark Reactions",
          "Factors Affecting Photosynthesis", "Cellular Respiration — Aerobic",
          "Anaerobic Respiration & Fermentation", "Transpiration & Stomata",
          "Xylem & Phloem — Transport", "Plant Hormones — Auxin, Gibberellin, Ethylene",
          "Tropisms — Phototropism, Gravitropism", "Asexual Plant Reproduction",
          "Sexual Plant Reproduction — Pollination & Fertilisation",
        ],
      },
    ],
  },
  {
    subject: "Earth Science", icon: "🌍", color: "bg-amber-500", light: "bg-amber-50", text: "text-amber-700", border: "border-amber-200",
    chapters: [
      {
        name: "Earth's Structure & Geology", topics: [
          "Layers of the Earth — Crust, Mantle, Outer & Inner Core",
          "Continental vs Oceanic Crust", "Rock Cycle — Igneous, Sedimentary, Metamorphic",
          "Types of Igneous Rocks", "Sedimentary Rock Formation", "Metamorphic Rock Formation",
          "Minerals — Properties & Identification", "Soil — Formation, Layers & Types",
          "Weathering — Physical, Chemical, Biological", "Erosion & Deposition",
        ],
      },
      {
        name: "Plate Tectonics", topics: [
          "Continental Drift Theory — Evidence", "Tectonic Plate Boundaries — Types",
          "Convergent Boundaries — Subduction & Collision", "Divergent Boundaries — Seafloor Spreading",
          "Transform Boundaries", "Earthquakes — Causes, Focus & Epicentre",
          "Seismic Waves — P & S Waves", "Richter & Moment Magnitude Scale",
          "Volcanoes — Types & Formation", "Volcanic Hazards & Monitoring", "Tsunamis",
        ],
      },
      {
        name: "Atmosphere & Weather", topics: [
          "Layers of the Atmosphere", "Composition of the Atmosphere",
          "Atmospheric Pressure & Altitude", "Cloud Types & Formation",
          "Precipitation — Types & Formation", "Air Masses & Fronts",
          "High & Low Pressure Systems", "Wind Systems — Trade Winds, Westerlies",
          "Storms — Thunderstorms, Tornadoes, Hurricanes", "Weather Forecasting",
        ],
      },
      {
        name: "Climate & Environment", topics: [
          "Climate vs Weather", "Köppen Climate Classification",
          "The Greenhouse Effect — Natural vs Enhanced", "Greenhouse Gases",
          "Global Warming — Evidence & Consequences", "Ocean Currents & Climate",
          "El Niño & La Niña", "Ozone Layer — Depletion & Recovery",
          "Human Impact on Environment", "Sustainable Development",
        ],
      },
      {
        name: "Astronomy", topics: [
          "The Sun — Structure & Energy Production", "The Solar System — Overview",
          "Inner Planets — Mercury, Venus, Earth, Mars", "Outer Planets — Jupiter, Saturn, Uranus, Neptune",
          "Dwarf Planets & the Kuiper Belt", "The Moon — Phases & Tides",
          "Asteroids, Comets & Meteors", "Stars — Classification & Life Cycle",
          "Hertzsprung-Russell Diagram", "Galaxies — Types & Structure",
          "The Big Bang Theory", "Dark Matter & Dark Energy",
        ],
      },
    ],
  },
];

function buildSciencePrompt(topic: string, subject: string): string {
  return `You are a world-class science teacher teaching "${topic}" from ${subject}. Provide a COMPREHENSIVE, DETAILED lesson.

CRITICAL SYMBOL RULE — applies to every text field in the JSON below, especially "equation" and "explanation":
NEVER use LaTeX syntax of any kind — no \\frac{}{}, \\sqrt{}, \\times, \\div, \\pm, \\leq, \\geq, \\neq, \\rightarrow, \\Delta, \\theta, \\pi, ^{}, _{}, $ signs, or any backslash commands. A student who has never seen LaTeX must be able to read every equation instantly.
Use plain Unicode symbols instead: × for multiply, ÷ for divide, ± for plus-minus, √ for square root, ² ³ for powers/exponents, ≤ ≥ ≠ ≈, → for reactions/"leads to", Δ for change, π θ α β γ, ° for degrees, and write fractions as "(numerator) / (denominator)" on one line, e.g. "v = Δs / t" NOT "v = \\frac{\\Delta s}{t}", and "F = (G × m₁ × m₂) / r²" NOT "\\frac{Gm_1m_2}{r^2}".

Return STRICT JSON only — no prose, no markdown fences:
{
  "topic": "${topic}",
  "subject": "${subject}",
  "introduction": "Engaging 3-4 sentence introduction that sparks curiosity and explains why this topic is important",
  "key_concepts": [
    {"term": "Key term", "definition": "Precise scientific definition (2 sentences)", "example": "Concrete example in everyday life"},
    ... 5 to 8 concepts ...
  ],
  "explanation": [
    {"section": "Section name (e.g. 'The Basic Mechanism', 'Types and Categories', 'How It Works')", "content": "Detailed explanation of this aspect (4-6 sentences with scientific depth)"},
    {"section": "Section 2", "content": "..."},
    {"section": "Section 3", "content": "..."},
    {"section": "Section 4 (Advanced Aspects)", "content": "..."}
  ],
  "diagrams_description": "Description of the key diagram/model/structure students should know and draw for this topic (2-3 sentences) or null",
  "equations": [
    {"name": "Equation name", "equation": "The equation/formula with symbols", "explanation": "What each symbol means and when to use it"},
    ... 1 to 5 equations if applicable, empty array if none ...
  ],
  "examples": [
    {"title": "Example title", "description": "Detailed 2-3 sentence real-world example", "significance": "Why this example matters scientifically (1 sentence)"},
    {"title": "Example 2", "description": "...", "significance": "..."},
    {"title": "Example 3", "description": "...", "significance": "..."}
  ],
  "experiment": {
    "title": "Experiment or investigation title",
    "aim": "What the experiment aims to demonstrate or investigate",
    "materials": ["Material 1", "Material 2", "Material 3", "..."],
    "steps": ["Step 1: detailed instruction", "Step 2: ...", "Step 3: ...", "Step 4: ...", "Step 5: ...", "Step 6: ..."],
    "expected_result": "What should happen and why it demonstrates the concept",
    "safety": "Any safety precautions needed, or null"
  },
  "practice_questions": [
    {"type": "Define", "question": "Define [key term from this topic]", "answer": "Complete definition answer (2-3 sentences)"},
    {"type": "Explain", "question": "Explain how [process] works", "answer": "Full explanation answer (3-4 sentences)"},
    {"type": "Apply", "question": "Application or calculation question about this topic", "answer": "Full model answer"},
    {"type": "Evaluate", "question": "Evaluate/compare/analyse question requiring higher-order thinking", "answer": "Detailed model answer (4-5 sentences)"},
    {"type": "Calculate", "question": "Numerical question if equations apply, otherwise a 'Describe' question", "answer": "Worked answer"}
  ],
  "connections": [
    "This topic connects to [related topic] because [reason] (1 sentence)",
    "Connection 2 to another topic",
    "Real-world/career connection (e.g. engineers use this for...)"
  ],
  "fun_fact": "A genuinely surprising, memorable, counterintuitive, or awe-inspiring fact about this topic"
}`;
}

function PracticeQuestion({ q, index }: { q: ScienceData["practice_questions"][0]; index: number }) {
  const [show, setShow] = useState(false);
  const typeColors: Record<string, string> = {
    Define: "bg-blue-100 text-blue-700 border-blue-200",
    Explain: "bg-violet-100 text-violet-700 border-violet-200",
    Apply: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Evaluate: "bg-amber-100 text-amber-700 border-amber-200",
    Calculate: "bg-red-100 text-red-700 border-red-200",
    Describe: "bg-cyan-100 text-cyan-700 border-cyan-200",
  };
  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="flex flex-col items-center gap-1.5">
          <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
        </div>
        <div className="flex-1 space-y-1.5">
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${typeColors[q.type] ?? "bg-muted text-muted-foreground"}`}>{q.type}</span>
          <p className="text-sm font-medium leading-relaxed">{q.question}</p>
        </div>
      </div>
      <button onClick={() => setShow(!show)} className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {show ? "Hide Model Answer" : "Show Model Answer"}
      </button>
      {show && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1.5">Model Answer</p>
          <p className="text-sm text-emerald-800 leading-relaxed">{q.answer}</p>
        </div>
      )}
    </div>
  );
}

function AskPanel({ topic, subject }: { topic: string; subject: string }) {
  const { user } = Route.useRouteContext();
  const [as, setAs] = usePageState(`science-ask-${topic}`, {
    messages: [] as AskMessage[],
    input: "",
  });
  const { messages, input } = as;
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { quota, bump } = useUsageLimit(user.id, "science-ask");

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const SUGGESTIONS = [
    `Give me a harder exam question on ${topic}`,
    `Explain ${topic} using an analogy`,
    `What are common mistakes in ${topic}?`,
    `How does ${topic} appear in real life?`,
  ];

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    const msgsWithUser: AskMessage[] = [...messages, { role: "user", content: text }];
    setAs({ messages: msgsWithUser, input: "" });
    setLoading(true);
    const system = `You are an expert ${subject} teacher. The student is studying "${topic}". Provide clear, accurate scientific explanations. Give examples. Be educational.

FORMATTING RULES (strict):
- Use **bold** generously to highlight key terms, scientific names, important values, and conclusions — every important word or phrase should be bolded so the answer is easy to scan.
- Break your answer into short paragraphs or a numbered/bulleted list. Never write a big wall of unbroken text.
- NEVER use LaTeX syntax of any kind — no \\boxed{}, \\frac{}, \\times, \\subset, \\to, ^{}, _{}, $ signs, or backslash commands. Use plain Unicode symbols instead: × for multiply, ÷ for divide, √ for square root, ² ³ for powers/exponents, π, ≤ ≥ ≠ ≈, → for "leads to" or reactions, ° for degrees.
- NEVER output raw HTML tags like <br>, <b>, <div> — use plain markdown (blank lines for new paragraphs, ** for bold) instead.
- Show equations and formulas using plain notation, bolding the key result of each step.`;
    const history = msgsWithUser.slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 2500) }));
    const res = await askAI(text, system, history);
    await bump();
    setAs({ messages: [...msgsWithUser, { role: "assistant", content: res.text }] });
    setLoading(false);
  }

  return (
    <div className="card-soft overflow-hidden">
      <div className="border-b border-border bg-primary/5 px-4 py-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-primary">Ask about {topic}</p>
      </div>
      {messages.length === 0 && (
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> Suggested questions</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(sg => (
              <button key={sg} onClick={() => send(sg)} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">{sg}</button>
            ))}
          </div>
        </div>
      )}
      {messages.length > 0 && (
        <div className="max-h-80 overflow-y-auto space-y-3 p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
              <div className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold overflow-hidden ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-white border border-primary/20"}`}>
                {m.role === "user" ? "You" : <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted/50"}`}>
                {m.role === "user" ? <p>{m.content}</p> : (
                  <TypewriterText
                    content={m.content}
                    animate={!m.revealed}
                    onDone={!m.revealed ? () => {
                      const next = [...messages];
                      if (next[i]) next[i] = { ...next[i], revealed: true };
                      setAs({ messages: next });
                    } : undefined}
                    className="prose prose-sm max-w-none prose-p:my-1.5 prose-li:my-1"
                  />
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-white border border-primary/20 overflow-hidden">
                <img src={logo} alt="Assistant" className="h-full w-full object-contain p-0.5" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-3 py-2.5">
                <div className="flex gap-1">{[0,150,300].map(d => <span key={d} className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="border-t border-border p-3 flex gap-2">
        <input value={input} onChange={e => setAs({ input: e.target.value })} onKeyDown={e => e.key === "Enter" && send()}
          placeholder={`Ask about ${topic}…`}
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <button onClick={() => send()} disabled={loading || !input.trim()} className="rounded-xl bg-primary px-3 py-2 text-white disabled:opacity-40">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SciencePage() {
  const { user } = Route.useRouteContext();
  const [ps, set] = usePageState("science", {
    activeSubjectIdx: 0,
    openChapter:      SCIENCE_SUBJECTS[0].chapters[0].name as string | null,
    selectedTopic:    null as string | null,
    scienceData:      null as ScienceData | null,
    provider:         null as string | null,
  });
  const { activeSubjectIdx, openChapter, selectedTopic, scienceData, provider } = ps;
  const [loading, setLoading] = useState(false);
  const { quota, quotaLoading, bump } = useUsageLimit(user.id, "science");

  const activeSubject = SCIENCE_SUBJECTS[activeSubjectIdx];

  function switchSubject(i: number) {
    set({ activeSubjectIdx: i, openChapter: SCIENCE_SUBJECTS[i].chapters[0].name, selectedTopic: null, scienceData: null });
  }

  async function selectTopic(topic: string) {
    if (topic === selectedTopic) return;
    if (quota && quota.remaining <= 0) return toast.error(QUOTA_MESSAGE);
    set({ selectedTopic: topic, scienceData: null });
    setLoading(true);
    try {
      const res = await askAI(buildSciencePrompt(topic, activeSubject.subject), "You are a science teacher. Return ONLY valid JSON — no markdown, no prose.");
      set({ provider: res.provider });
      await bump();
      const parsed = extractJSON<ScienceData>(res.text);
      if (parsed) { set({ scienceData: parsed }); } else { toast.error("Could not load topic — try again"); set({ selectedTopic: null }); }
    } catch { toast.error("Failed to load topic"); set({ selectedTopic: null }); }
    setLoading(false);
  }

  if (selectedTopic) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => set({ selectedTopic: null, scienceData: null })}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Back to topics
          </button>
          <QuotaBadge quota={quota} loading={quotaLoading} />
        </div>

        {loading ? (
          <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading {selectedTopic}…</p>
          </div>
        ) : scienceData ? (
            <div className="space-y-4">
              {/* Header */}
              <div className={`rounded-2xl ${activeSubject.color} p-5 text-white`}>
                <p className="text-xs font-bold uppercase tracking-wider opacity-75">{scienceData.subject}</p>
                <h3 className="mt-1 text-xl font-bold">{scienceData.topic}</h3>
                <p className="mt-2 text-sm leading-relaxed opacity-90">{scienceData.introduction}</p>
                <div className="mt-3"><ProviderBadge provider={provider} /></div>
              </div>

              {/* Key concepts grid */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🔑 Key Concepts</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {scienceData.key_concepts.map((c, i) => (
                    <div key={i} className={`rounded-xl border ${activeSubject.border} ${activeSubject.light} p-3.5`}>
                      <p className={`text-xs font-bold ${activeSubject.text}`}>{c.term}</p>
                      <p className="mt-0.5 text-xs text-foreground/75 leading-relaxed">{c.definition}</p>
                      {c.example && <p className="mt-1.5 text-[10px] text-foreground/50 italic">e.g. {c.example}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Explanation sections */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">📖 Detailed Explanation</h4>
                <div className="space-y-4">
                  {scienceData.explanation.map((sec, i) => (
                    <div key={i}>
                      <h5 className={`text-sm font-bold mb-1.5 ${activeSubject.text}`}>{sec.section}</h5>
                      <p className="text-sm leading-relaxed text-foreground/85">{sec.content}</p>
                      {i < scienceData.explanation.length - 1 && <div className="mt-4 border-b border-border/50" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagram description */}
              {scienceData.diagrams_description && (
                <div className={`rounded-xl border ${activeSubject.border} ${activeSubject.light} p-4`}>
                  <p className={`text-xs font-bold ${activeSubject.text} mb-2`}>🖊️ Diagram to Know</p>
                  <p className="text-sm leading-relaxed text-foreground/80">{scienceData.diagrams_description}</p>
                </div>
              )}

              {/* Equations */}
              {scienceData.equations?.length > 0 && (
                <div className="card-soft p-4 sm:p-5">
                  <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🔢 Equations & Formulas</h4>
                  <div className="space-y-3">
                    {scienceData.equations.map((eq, i) => (
                      <div key={i} className="rounded-xl border border-border overflow-hidden">
                        <div className={`px-4 py-3 ${activeSubject.light}`}>
                          <p className={`text-xs font-bold ${activeSubject.text}`}>{eq.name}</p>
                          <p className="mt-1.5 font-mono text-lg font-bold text-foreground">{eq.equation}</p>
                        </div>
                        <p className="px-4 py-2.5 text-xs text-muted-foreground bg-background">{eq.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Examples */}
              <div className="card-soft p-4 sm:p-5">
                <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">🌟 Real-World Examples</h4>
                <div className="space-y-3">
                  {scienceData.examples.map((ex, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3.5">
                      <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${activeSubject.color} text-sm text-white`}>
                        {["🔬","🔭","💡","🌍","⚗️"][i % 5]}
                      </span>
                      <div>
                        <p className="text-sm font-bold">{ex.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{ex.description}</p>
                        {ex.significance && <p className={`mt-1.5 text-[10px] font-semibold ${activeSubject.text}`}>→ {ex.significance}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Experiment */}
              <div className={`rounded-2xl border ${activeSubject.border} ${activeSubject.light} p-5`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text} mb-1`}>🧪 Experiment / Investigation</p>
                <p className="font-bold text-foreground text-base mt-1">{scienceData.experiment.title}</p>
                <p className="mt-1 text-sm text-foreground/80">{scienceData.experiment.aim}</p>

                {scienceData.experiment.materials?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold text-foreground/60 mb-1.5">Materials needed:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {scienceData.experiment.materials.map((m, i) => (
                        <span key={i} className="rounded-full bg-white/70 border border-white px-2.5 py-0.5 text-xs text-foreground/70">{m}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {scienceData.experiment.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${activeSubject.color} text-[9px] font-bold text-white mt-0.5`}>{i + 1}</span>
                      <p className="text-sm text-foreground/80 leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>

                {scienceData.experiment.expected_result && (
                  <div className="mt-4 rounded-xl border border-white bg-white/50 p-3">
                    <p className="text-xs font-bold text-foreground/60 mb-1">Expected Result:</p>
                    <p className="text-sm text-foreground/80">{scienceData.experiment.expected_result}</p>
                  </div>
                )}

                {scienceData.experiment.safety && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <span className="text-red-500 flex-shrink-0">⚠️</span>
                    <p className="text-xs text-red-700">{scienceData.experiment.safety}</p>
                  </div>
                )}
              </div>

              {/* Practice questions */}
              <div className="card-soft p-4 sm:p-5 space-y-3">
                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">✏️ Practice Questions</h4>
                {scienceData.practice_questions.map((q, i) => <PracticeQuestion key={i} q={q} index={i} />)}
              </div>

              {/* Connections */}
              {scienceData.connections?.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">🔗 Topic Connections</p>
                  <ul className="space-y-1.5">
                    {scienceData.connections.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary/40 flex-shrink-0" />{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fun fact */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-700 mb-1.5">🤩 Fun Fact</p>
                <p className="text-sm text-amber-900 leading-relaxed">{scienceData.fun_fact}</p>
              </div>

              {/* Ask AI */}
              <AskPanel topic={selectedTopic} subject={activeSubject.subject} />
            </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 lg:max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Science</h2>
          <p className="text-sm text-muted-foreground">Physics, Chemistry, Biology & Earth Science — with experiments & AI chat</p>
        </div>
        <QuotaBadge quota={quota} loading={quotaLoading} />
      </div>

      {/* Subject tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SCIENCE_SUBJECTS.map(({ subject, icon, color }, i) => (
          <button key={subject} onClick={() => switchSubject(i)}
            className={`flex-shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-all ${activeSubjectIdx === i ? `${color} text-white shadow-sm` : "border border-border bg-background hover:bg-accent"}`}>
            {icon} {subject}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-72 flex-shrink-0">
          <div className="card-soft overflow-hidden">
            <div className={`border-b border-border px-4 py-2.5 ${activeSubject.light}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${activeSubject.text}`}>{activeSubject.icon} {activeSubject.subject}</p>
            </div>
            <nav className="max-h-[55vh] overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
              {activeSubject.chapters.map(({ name, topics }) => (
                <div key={name}>
                  <button onClick={() => set({ openChapter: openChapter === name ? null : name })}
                    className="flex w-full items-center gap-2 border-b border-border/50 px-4 py-2.5 text-left text-xs font-bold hover:bg-accent">
                    <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded ${activeSubject.color} text-[9px] text-white`}>
                      {openChapter === name ? "−" : "+"}
                    </span>
                    <span className="flex-1 truncate">{name}</span>
                    <span className="text-[10px] text-muted-foreground">{topics.length}</span>
                  </button>
                  {openChapter === name && (
                    <div className={`border-b border-border/40`}>
                      {topics.map(topic => (
                        <button key={topic} onClick={() => selectTopic(topic)}
                          className={`flex w-full items-center gap-2 px-5 py-2 text-left text-xs transition-colors ${selectedTopic === topic ? `${activeSubject.color} text-white font-bold` : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
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
          <div className="card-soft flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="text-5xl">{activeSubject.icon}</div>
            <div>
              <p className="font-bold">{activeSubject.subject}</p>
              <p className="mt-1 text-sm text-muted-foreground">Select a topic for a full lesson with concepts, experiments, practice questions & AI chat</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {activeSubject.chapters[0].topics.slice(0, 4).map(t => (
                <button key={t} onClick={() => { set({ openChapter: activeSubject.chapters[0].name }); selectTopic(t); }}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent">{t}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
