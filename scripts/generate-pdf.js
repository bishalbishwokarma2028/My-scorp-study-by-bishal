const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 50, bottom: 50, left: 55, right: 55 },
  info: {
    Title: "ScorpStudy by Bishal – College Project Presentation Guide",
    Author: "Bishal Bishwokarma",
    Subject: "Full Technical Q&A Guide for College Project Presentation",
  },
});

const OUT = path.join(__dirname, "..", "public", "scorpstudy-presentation-guide.pdf");
doc.pipe(fs.createWriteStream(OUT));

// ─── Colors ────────────────────────────────────────────────────────────────
const PURPLE    = "#7c3aed";
const DARK      = "#1e1b4b";
const GRAY      = "#6b7280";
const LIGHT_BG  = "#f5f3ff";
const GREEN     = "#059669";
const RED       = "#dc2626";
const BLUE      = "#2563eb";
const ORANGE    = "#d97706";
const W         = doc.page.width - 110; // usable width

// ─── Helpers ───────────────────────────────────────────────────────────────
function heading1(text) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 80).fill(PURPLE);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(22)
     .text(text, 55, 25, { width: W });
  doc.fillColor(DARK).moveDown(2);
}

function heading2(text) {
  doc.moveDown(0.6);
  doc.rect(55, doc.y, W, 26).fill(LIGHT_BG);
  doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(13)
     .text(text, 62, doc.y - 21, { width: W - 14 });
  doc.fillColor(DARK).moveDown(0.5);
}

function heading3(text) {
  doc.moveDown(0.4);
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(11).text(text);
  doc.moveDown(0.1);
}

function para(text, color = DARK) {
  doc.fillColor(color).font("Helvetica").fontSize(10).text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

function qBox(question, answer, tip = null) {
  const startY = doc.y;
  // check page space
  if (doc.y > doc.page.height - 160) doc.addPage();

  // Question bubble
  doc.rect(55, doc.y, W, 22).fill("#ddd6fe");
  doc.fillColor(DARK).font("Helvetica-Bold").fontSize(10)
     .text("Q: " + question, 62, doc.y - 18, { width: W - 14 });
  doc.moveDown(0.8);

  // Answer
  doc.fillColor(DARK).font("Helvetica").fontSize(10)
     .text("➤  " + answer, 62, doc.y, { width: W - 14, lineGap: 3 });
  doc.moveDown(0.3);

  if (tip) {
    doc.fillColor(GREEN).font("Helvetica-Oblique").fontSize(9)
       .text("💡 Tip: " + tip, 62, doc.y, { width: W - 14 });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.5);
}

function bullet(items, color = DARK) {
  items.forEach(item => {
    doc.fillColor(color).font("Helvetica").fontSize(10)
       .text("  •  " + item, { lineGap: 2 });
  });
  doc.moveDown(0.4);
}

function tableRow(col1, col2, col3, isHeader = false) {
  const x1 = 55, x2 = 200, x3 = 370;
  const rowH = 18;
  if (isHeader) {
    doc.rect(55, doc.y, W, rowH).fill(PURPLE);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(9);
  } else {
    doc.fillColor(DARK).font("Helvetica").fontSize(9);
  }
  const y = doc.y + 4;
  doc.text(col1, x1 + 4, y, { width: 140 });
  doc.text(col2, x2 + 4, y, { width: 165 });
  doc.text(col3, x3 + 4, y, { width: 175 });
  doc.moveDown(0.05);
  if (!isHeader) {
    doc.moveTo(55, doc.y + 10).lineTo(55 + W, doc.y + 10)
       .strokeColor("#e5e7eb").stroke();
  }
  doc.moveDown(0.6);
}

function divider() {
  doc.moveDown(0.3);
  doc.moveTo(55, doc.y).lineTo(55 + W, doc.y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

function badge(text, color = PURPLE) {
  doc.rect(55, doc.y, text.length * 6.5 + 10, 15).fill(color);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(8)
     .text(text, 60, doc.y - 12);
  doc.moveDown(0.8);
}

// ══════════════════════════════════════════════════════════════════════════════
//  COVER PAGE
// ══════════════════════════════════════════════════════════════════════════════
doc.rect(0, 0, doc.page.width, doc.page.height).fill(PURPLE);

doc.fillColor("white").font("Helvetica-Bold").fontSize(30)
   .text("ScorpStudy by Bishal", 55, 180, { align: "center", width: W });

doc.fillColor("#c4b5fd").font("Helvetica").fontSize(16)
   .text("AI-Powered Student Learning Platform", { align: "center", width: W });

doc.moveDown(2);
doc.rect(100, doc.y, W - 90, 1).fill("#c4b5fd");
doc.moveDown(1.5);

doc.fillColor("white").font("Helvetica-Bold").fontSize(18)
   .text("COLLEGE PROJECT PRESENTATION GUIDE", { align: "center", width: W });

doc.moveDown(0.5);
doc.fillColor("#e0d7ff").font("Helvetica").fontSize(13)
   .text("Complete Technical Q&A — Every Question You May Face", { align: "center", width: W });

doc.moveDown(3);
doc.fillColor("white").font("Helvetica-Bold").fontSize(12)
   .text("Prepared by: Bishal Bishwokarma", { align: "center", width: W });
doc.fillColor("#c4b5fd").font("Helvetica").fontSize(11)
   .text("scorpstudy.in.net", { align: "center", width: W });

doc.moveDown(6);
doc.fillColor("#9f7aea").font("Helvetica").fontSize(10)
   .text("CONFIDENTIAL — FOR PERSONAL USE ONLY", { align: "center", width: W });

// ══════════════════════════════════════════════════════════════════════════════
//  TABLE OF CONTENTS
// ══════════════════════════════════════════════════════════════════════════════
doc.addPage();
doc.rect(0, 0, doc.page.width, 70).fill(PURPLE);
doc.fillColor("white").font("Helvetica-Bold").fontSize(20)
   .text("Table of Contents", 55, 22, { width: W });
doc.fillColor(DARK).moveDown(2);

const tocItems = [
  ["1.", "Project Overview & Introduction", "3"],
  ["2.", "Technology Stack — Deep Dive", "4"],
  ["3.", "System Architecture & Design", "5"],
  ["4.", "Module-by-Module Breakdown", "6"],
  ["5.", "Database & Backend Design", "10"],
  ["6.", "AI Integration & Provider System", "11"],
  ["7.", "Authentication & Security", "12"],
  ["8.", "Frontend Architecture", "13"],
  ["9.", "SEO & Deployment", "14"],
  ["10.", "General Project Questions", "15"],
  ["11.", "Technical Deep-Dive Questions", "17"],
  ["12.", "Business & Problem-Solving Questions", "20"],
  ["13.", "Code & Implementation Questions", "21"],
  ["14.", "Difficult/Trick Questions", "23"],
  ["15.", "Personal & Process Questions", "25"],
  ["16.", "Future Plans & Improvements", "26"],
  ["17.", "Quick-Reference Cheat Sheet", "27"],
];

tocItems.forEach(([num, title, pg]) => {
  const y = doc.y;
  doc.fillColor(PURPLE).font("Helvetica-Bold").fontSize(10).text(num, 60, y, { width: 25 });
  doc.fillColor(DARK).font("Helvetica").fontSize(10).text(title, 85, y, { width: W - 80 });
  doc.fillColor(GRAY).font("Helvetica").fontSize(9).text("pg " + pg, 55 + W - 40, y, { width: 40, align: "right" });
  doc.moveTo(85, doc.y + 6).lineTo(55 + W - 50, doc.y + 6).strokeColor("#e5e7eb").dash(2, { space: 2 }).stroke();
  doc.undash();
  doc.moveDown(0.6);
});

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 1: PROJECT OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 1: Project Overview & Introduction");

heading2("What is ScorpStudy?");
para("ScorpStudy is a full-stack, AI-powered educational web application designed to serve as a 24/7 personalized study companion for students. It integrates multiple artificial intelligence providers to deliver instant tutoring, auto-generated quizzes, smart notes, PDF analysis, flashcard decks, mind maps, mock exams, grammar lessons, math lessons, science lessons, and language translation — all in a single unified platform, completely free of charge.");

heading2("The Problem It Solves");
para("In developing countries like Nepal, access to quality tutoring is limited by geography and cost. Private tutors charge high fees; quality textbooks are expensive; and students in rural areas have no access to expert guidance. ScorpStudy bridges this gap by putting an expert AI tutor in every student's pocket, available 24 hours a day, 7 days a week, in any language.");

heading2("Opening Statement (Memorize This)");
doc.rect(55, doc.y, W, 48).fill("#f0fdf4");
doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(10)
   .text('"ScorpStudy is a full-stack AI-powered education platform built with React, TypeScript,', 62, doc.y - 44, { width: W - 14 });
doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(10)
   .text('Supabase, and multiple AI APIs. It gives every student a 24/7 personalized tutor across', 62, doc.y - 12, { width: W - 14 });
doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(10)
   .text('10+ learning modules — completely free."', 62, doc.y - 0, { width: W - 14 });
doc.moveDown(2.5);

qBox(
  "Tell me about your project in one minute.",
  "ScorpStudy is an AI-powered learning platform I built to solve a real problem — students in Nepal and similar developing countries don't have affordable access to quality tutors. The platform provides 10+ learning modules: an AI chat tutor, math and science lessons with structured content, grammar reference, quiz generator, flashcard maker, mind maps, mock tests, PDF analysis, smart notes, and a translator. It's built on React with TypeScript, uses Supabase as the backend database and auth provider, and integrates with multiple AI APIs including Groq and Cerebras for fast responses. The app is live at scorpstudy.in.net and is completely free for students.",
  "Speak slowly, make eye contact, and pause after the first sentence to let it land."
);

qBox(
  "Who is your target audience?",
  "My primary target audience is high school and college students, particularly those in Nepal and South Asia who are preparing for board exams, entrance tests, or university courses. Secondary audiences include self-learners of any age who want structured AI-assisted learning. The platform works in any language, so it's useful globally.",
  null
);

qBox(
  "What inspired you to build this?",
  "I saw that my own classmates and I were spending a lot of time searching through YouTube, textbooks, and different websites just to understand one concept. There was no single place that could explain something, quiz you on it, and let you practice — all in one. I thought: AI can do all of this. So I decided to build a platform that combines all these learning tools with the power of modern AI models.",
  "This is personal and genuine — it will resonate with judges."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 2: TECHNOLOGY STACK
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 2: Technology Stack — Deep Dive");

heading2("Complete Technology Stack");
tableRow("Layer", "Technology", "Why This Choice", true);
tableRow("UI Framework", "React 19 + TypeScript", "Component-based, type-safe, industry standard");
tableRow("Meta-Framework", "TanStack Start", "SSR support, file-based routing, SEO-friendly");
tableRow("Styling", "Tailwind CSS", "Utility-first, fast to build, consistent design");
tableRow("Database", "Supabase (PostgreSQL)", "Open-source, real-time, auth built-in, free tier");
tableRow("Runtime/Build", "Bun", "3× faster than Node.js for builds and server");
tableRow("AI — Primary", "Groq API (Llama 3)", "Extremely fast inference, free tier available");
tableRow("AI — Secondary", "Cerebras API", "Ultra-fast chip-level inference, fallback provider");
tableRow("AI — Tertiary", "OpenRouter API", "Routes to 100+ models, ultimate fallback");
tableRow("Auth", "Supabase Auth", "JWT-based, email/password, session management");
tableRow("PDF Parsing", "pdfjs-dist", "Mozilla's PDF.js, client-side text extraction");
tableRow("Markdown", "react-markdown + remark-gfm", "Renders AI responses with proper formatting");
tableRow("Icons", "Lucide React", "Consistent, tree-shakeable SVG icon library");
tableRow("Notifications", "Sonner", "Toast notification library for user feedback");
tableRow("HTTP Caching", "TanStack Query", "Server state management and caching");
tableRow("Deployment", "Replit / Custom Domain", "Live at scorpstudy.in.net");

heading2("Why Not Use Flutter / Next.js / Vue?");
qBox(
  "Why did you choose React over Flutter or other frameworks?",
  "Flutter is primarily designed for mobile apps, although it supports web. Since ScorpStudy is a content-heavy educational web platform — not a mobile app — React was the right choice because it has a mature ecosystem for web, excellent SEO support through SSR, and the largest community for web development. I specifically used TanStack Start on top of React for Server-Side Rendering, which Flutter Web doesn't support natively. React's component model also made it very efficient to build the 10+ different learning modules since I could reuse components across pages.",
  null
);

qBox(
  "Why Supabase and not Firebase or MongoDB?",
  "Supabase uses PostgreSQL, which is a relational database — perfect for structured data like user profiles, notes, quiz results, and daily usage tracking where relationships between tables matter. Firebase uses a NoSQL document model, which is less structured. Supabase is also open-source, has a generous free tier, and comes with built-in authentication, real-time subscriptions, and row-level security — all features I needed. MongoDB is also NoSQL and would require a separate auth solution. Supabase was the most complete, cost-effective, and developer-friendly choice.",
  null
);

qBox(
  "Why Bun instead of Node.js or npm?",
  "Bun is a modern JavaScript runtime that is 3 to 10 times faster than Node.js for server-side operations and package installation. It has built-in TypeScript support without needing ts-node. For a student project, faster build times mean faster development iterations. Bun is also fully compatible with the Node.js ecosystem, so all existing npm packages work with it. It was simply the better, faster choice.",
  null
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 3: SYSTEM ARCHITECTURE
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 3: System Architecture & Design");

heading2("High-Level Architecture");
para("ScorpStudy follows a modern full-stack web architecture with three main layers:");
bullet([
  "Frontend (Client): React components rendered in the browser, handling UI, user interaction, and state management.",
  "Backend (Server): TanStack Start's SSR server handles page rendering, API route processing, and session validation.",
  "Data Layer: Supabase PostgreSQL database stores all persistent data; AI APIs are called from both client and server.",
]);

heading2("Request Flow — How a User Message Works");
para("Here is the step-by-step flow when a student asks a question in Bishal's Assistant:");
const flow = [
  "1. User types a message and clicks Send.",
  "2. The React component calls the askAI() function in src/lib/aiProvider.ts.",
  "3. askAI() checks which AI provider is available (Groq → Cerebras → OpenRouter).",
  "4. The message is formatted with a system prompt and conversation history.",
  "5. An HTTP POST request is sent to the selected AI provider's API endpoint.",
  "6. The AI API returns a streamed or complete response.",
  "7. The response is displayed with a typewriter animation via the TypewriterText component.",
  "8. The message is saved to the component's state for the conversation history.",
  "9. The daily usage counter in Supabase is incremented via a stored procedure.",
];
flow.forEach(f => para("  " + f));

heading2("Folder Structure");
para("The project follows a standard modern React full-stack structure:");
doc.font("Courier").fontSize(9).fillColor(DARK).text(
`src/
  routes/                    ← File-based routing (TanStack Router)
    __root.tsx               ← Root layout, SEO meta tags, JSON-LD
    index.tsx                ← Landing page
    auth.tsx                 ← Login / Sign-up page
    _authenticated/          ← All pages requiring login
      dashboard.chat.tsx     ← Bishal's Assistant (AI Chat)
      dashboard.math.tsx     ← Math Tutor
      dashboard.science.tsx  ← Science Tutor
      dashboard.grammar.tsx  ← English Grammar
      dashboard.quiz.tsx     ← Quiz Generator
      dashboard.notes.tsx    ← Smart Notes
      dashboard.flashcards.tsx ← Flashcard Maker
      dashboard.mindmap.tsx  ← Mind Map Generator
      dashboard.pdf-chat.tsx ← PDF Chat
      dashboard.mock-test.tsx ← Mock Test
      dashboard.translator.tsx ← Language Translator
  lib/
    aiProvider.ts            ← AI provider rotation & API calls
    supabase.ts              ← Database client
    pageState.ts             ← Persistent UI state across routes
  components/
    TypewriterText.tsx       ← Animated AI response rendering
    askMdComponents.tsx      ← Custom markdown renderer
  hooks/
    useUsageLimit.ts         ← Daily quota tracking
public/
  favicon.ico / favicon.png  ← App icons
  og-image.png               ← Social media preview image
  site.webmanifest           ← PWA manifest`, { lineGap: 1 });
doc.font("Helvetica").moveDown(0.5);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 4: MODULES
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 4: Module-by-Module Breakdown");

heading2("Module 1 — Bishal's Assistant (AI Chat)");
heading3("What it does:");
para("A multi-turn conversational AI tutor that can answer questions on any subject — exactly like having a personal tutor available 24/7. It remembers the conversation history within a session so follow-up questions are contextual.");
heading3("How it works technically:");
bullet([
  "User messages are collected in a messages[] state array with role: 'user' | 'assistant'.",
  "On send, the full conversation history (truncated to 3000 chars per message) is formatted and sent to the AI API.",
  "The AI has a system prompt that defines it as 'Bishal's Assistant' with a helpful, educational personality.",
  "Responses are rendered with TypewriterText component — characters appear progressively, simulating typing.",
  "Each message is marked 'revealed' after animation so it doesn't replay on re-render.",
  "Special identity questions ('Who made you?', 'What AI are you?') are intercepted and answered as Bishal's Assistant.",
]);
qBox(
  "How does the chat remember previous messages?",
  "I maintain a messages array in React state. Every time the user sends a new message, I include the entire conversation history — formatted as an array of {role, content} objects — in the API request. The AI provider sees the full context and responds accordingly. I also truncate very long messages to 3000 characters to stay within API token limits."
);
qBox(
  "How does the typewriter animation work?",
  "I built a custom TypewriterText React component. It takes the full response text and splits it into small chunks. Using a setInterval timer, it progressively reveals chunks by updating a state variable that holds the currently-displayed portion of text. Once the full text is revealed, the animation stops and the 'revealed' flag is set to true so the animation doesn't replay. The component also renders markdown formatting using react-markdown."
);

divider();
heading2("Module 2 — Math Tutor");
heading3("What it does:");
para("Provides structured, comprehensive math lessons across Algebra, Geometry, Calculus, Trigonometry, Statistics, and more. Each lesson includes key concepts, formulas, worked examples, practice questions, and real-world applications.");
heading3("How it works technically:");
bullet([
  "User selects a subject (e.g., Algebra) and a topic (e.g., Quadratic Equations).",
  "A detailed JSON-schema prompt is sent to the AI requesting a lesson in a specific structured format.",
  "The AI returns a JSON object with fields: topic, overview, key_concepts[], formulas[], worked_examples[], practice_questions[], real_world_applications[].",
  "The JSON is parsed with extractJSON() — a robust parser that handles cases where the AI wraps JSON in markdown code blocks.",
  "The lesson is rendered as card-based UI with tabs, collapsible sections, and formula formatting.",
  "Math symbols (×, ÷, √, π, ∫, ∑) are rendered as Unicode characters, not raw LaTeX.",
  "The page converts to full-screen lesson view when a topic is selected, with a Back button to return.",
]);
qBox(
  "Why don't you use LaTeX for math formulas?",
  "I considered LaTeX rendering libraries like KaTeX or MathJax, but they add significant bundle size and complexity. Since the AI returns formulas as structured text, I instead prompt the AI to use Unicode math symbols directly — like × instead of \\times, √ instead of \\sqrt, and ² for superscripts. This keeps the rendering fast, lightweight, and readable without any additional libraries."
);

divider();
heading2("Module 3 — Science Tutor");
heading3("What it does:");
para("Covers Physics, Chemistry, Biology, and Earth Science with structured lessons including concept explanations, key equations, experiment guides, practice questions, topic connections, and fun facts.");
heading3("Key technical details:");
bullet([
  "Organized into subjects → chapters → topics (hierarchical sidebar with accordion navigation).",
  "Experiment section includes: materials list, step-by-step procedure, expected result, and safety warnings.",
  "Same JSON-structured lesson pattern as Math but with additional fields: experiment{}, connections[], fun_fact.",
  "Full-page lesson view on topic selection — sidebar disappears, lesson expands to max-width centered layout.",
]);
qBox(
  "How did you structure the science content hierarchy?",
  "I defined a SCIENCE_SUBJECTS constant — an array of subject objects, each with a subject name, color theme, icon, and chapters array. Each chapter has a name and a topics array of strings. This data structure drives the sidebar navigation. When a topic is selected, the topic name is injected into an AI prompt that returns the full lesson as JSON. The UI adapts dynamically based on this data — adding a new subject or chapter only requires updating this constant."
);

divider();
heading2("Module 4 — English Grammar");
heading3("What it does:");
para("A complete grammar reference covering all major English grammar topics organized by category (Tenses, Conditionals, Articles, Prepositions, Common Errors, etc.) with rules, examples, common mistakes, exercises, and advanced notes.");
heading3("Key technical details:");
bullet([
  "Topics organized into categories with icons and color themes (GRAMMAR_TOPICS constant).",
  "AI returns: definition, when_to_use, structure (sentence pattern), rules[], examples[], common_mistakes[], exercise{}, advanced_notes[].",
  "Learn/Practice tab system — Learn shows rules and examples; Practice shows interactive exercises.",
  "Each example shows incorrect sentence (red, strikethrough) → correct sentence (green) → explanation.",
]);
qBox(
  "How do you handle the exercise/practice section?",
  "The AI generates an exercise object with an instruction and a questions array. Each question has a question_text, blanks to fill, and an answers array. I render these as interactive form inputs. When the student submits, the component compares the input to the correct answers and shows green/red feedback with explanations. This is all client-side — no additional API call needed for grading the exercises."
);

divider();
heading2("Module 5 — Quiz Generator");
heading3("What it does:");
para("Generates customizable multiple-choice quizzes on any topic. Students choose the topic, number of questions (5–20), and difficulty level (Easy, Medium, Hard). After completion, they see their score, time taken, and detailed explanations for each answer.");
heading3("Key technical details:");
bullet([
  "Prompt specifies: topic, count, difficulty, and requests JSON array of {question, options[4], correct_index, explanation}.",
  "Questions are shuffled to prevent pattern memorization.",
  "Timer runs from 0 counting up; recorded at submission.",
  "Answer state tracked in an answers{} object keyed by question index.",
  "Results screen shows: score percentage, time, each question with correct/incorrect indicators and explanation.",
]);

divider();
heading2("Module 6 — Smart Notes");
heading3("What it does:");
para("A rich-text notes editor where students can write their own notes and then use AI to enhance, restructure, summarize, or expand them. Notes are saved to the user's account in Supabase.");
heading3("Key technical details:");
bullet([
  "Notes CRUD operations against Supabase 'notes' table with user_id foreign key.",
  "AI enhancement: user selects enhancement type (Summarize / Expand / Restructure / Add Examples) and the note text is sent to AI.",
  "Notes list shown in sidebar; clicking a note loads it into the editor.",
  "Auto-save on blur using useEffect and debouncing.",
]);

divider();
heading2("Module 7 — Flashcard Maker");
heading3("What it does:");
para("Generates spaced-repetition flashcard decks on any topic. Cards flip with a CSS animation to reveal the answer. Decks are saved per user.");
heading3("Key technical details:");
bullet([
  "AI generates: deck_title, description, cards[]{front, back, hint}.",
  "CSS 3D transform (rotateY 180deg) used for card flip animation.",
  "Cards stored in Supabase 'flashcard_decks' table as JSONB.",
  "Study mode: user marks card as 'known' or 'review again'; progress tracked per session.",
]);

divider();
heading2("Module 8 — Mind Map Generator");
heading3("What it does:");
para("Generates visual hierarchical mind maps as SVG diagrams. The central topic connects to main branches, which connect to sub-topics with color-coded paths.");
heading3("Key technical details:");
bullet([
  "AI returns: central_topic, branches[]{label, color, sub_topics[]}.",
  "SVG is generated programmatically — no third-party library. Custom radial layout algorithm positions nodes.",
  "Central node at SVG center (750, 650); branch nodes placed at radius 270; sub-topic nodes at radius 480.",
  "Bezier curves drawn between nodes using SVG <path> elements.",
  "ViewBox set to 1500×1300 to prevent clipping of outer nodes.",
  "SVG can be downloaded as a file.",
]);
qBox(
  "How does the mind map layout algorithm work?",
  "I calculate node positions using trigonometry. The main branches are evenly distributed around the center using the formula: angle = (index / totalBranches) × 2π. For each branch at angle θ and radius R: x = centerX + R × cos(θ), y = centerY + R × sin(θ). Sub-topics are positioned around their parent branch node at a smaller spread angle. The paths connecting nodes are cubic Bezier curves where the control points are at the midpoints between nodes, creating smooth curves rather than straight lines."
);

divider();
heading2("Module 9 — PDF Chat");
heading3("What it does:");
para("Students upload any PDF document (textbook chapter, research paper, question paper) and then ask questions about it. The AI reads the PDF content and answers questions based only on the document.");
heading3("Key technical details:");
bullet([
  "PDF text extracted client-side using pdfjs-dist (Mozilla's PDF.js library).",
  "Extracted text (up to ~8000 characters) is injected into the AI system prompt as context.",
  "AI is instructed to answer ONLY based on the provided document, not from general knowledge.",
  "Chat history maintained per session; messages rendered with markdown bold/highlighting.",
  "File size limit and text extraction error handling with user-friendly error messages.",
]);
qBox(
  "How do you extract text from a PDF?",
  "I use pdfjs-dist — Mozilla's open-source PDF rendering library — which runs entirely in the browser (no server upload needed). When a user selects a PDF, I load it into a PDFDocumentProxy, then iterate through each page using getPage(). Each page's text is extracted with getTextContent(), which returns an array of text items. I concatenate these items, joining them with spaces and newlines to reconstruct readable paragraphs. The result is a plain text string that I inject into the AI system prompt as document context."
);

divider();
heading2("Module 10 — Mock Test");
heading3("What it does:");
para("Full timed exam simulations with configurable question count, topic, and difficulty. Simulates real exam conditions with a countdown timer, question navigation, and a comprehensive result analysis.");

divider();
heading2("Module 11 — Language Translator");
heading3("What it does:");
para("Translates text between any languages using AI, with additional explanation of translation nuances, cultural context, and alternative phrasings.");

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 5: DATABASE
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 5: Database & Backend Design");

heading2("Supabase Database Schema");
para("The application uses a PostgreSQL database (via Supabase) with the following key tables:");

tableRow("Table", "Key Columns", "Purpose", true);
tableRow("profiles", "id (UUID), email, full_name, avatar_url", "User profile data, linked to auth.users");
tableRow("notes", "id, user_id, title, content, created_at", "User's smart notes");
tableRow("flashcard_decks", "id, user_id, title, cards (JSONB), topic", "Flashcard decks with cards as JSON");
tableRow("quiz_results", "id, user_id, topic, score, total, time_taken", "Quiz attempt history");
tableRow("daily_usage", "user_id, date, feature, count", "Per-feature daily quota tracking");

heading2("Row-Level Security (RLS)");
para("Supabase Row-Level Security ensures each user can only access their own data. For every table, I defined RLS policies:");
doc.font("Courier").fontSize(9).fillColor(DARK).text(
`-- Example RLS policy for notes table:
CREATE POLICY "Users can only see their own notes"
  ON notes FOR ALL
  USING (auth.uid() = user_id);

-- This means even if someone calls the API directly,
-- they cannot read another user's notes.`, { lineGap: 1 });
doc.font("Helvetica").moveDown(0.5);

qBox(
  "How does the daily usage limit work technically?",
  "I have a daily_usage table with columns: user_id, date (today's date), feature (e.g., 'chat', 'math'), and count. When a user makes an AI request, I call a Postgres stored procedure called increment_daily_usage. This function atomically increments the count using INSERT ... ON CONFLICT DO UPDATE, which is an upsert operation — it creates the row if it doesn't exist, or increments if it does. This is atomic and race-condition safe. Before each request, I check if the count is already at the limit and block the request client-side.",
  "Knowing 'upsert' and 'atomic operation' will impress technical judges."
);

qBox(
  "What is a stored procedure and why did you use one?",
  "A stored procedure is a precompiled set of SQL statements stored in the database that can be called by the application. I used a stored procedure for the usage increment because it executes atomically on the database server — this prevents race conditions where two simultaneous requests might both read count=4 and both increment to 5, when they should reach 6. The procedure handles the read-modify-write as a single indivisible operation."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 6: AI INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 6: AI Integration & Provider System");

heading2("Multi-Provider Architecture");
para("ScorpStudy uses a provider rotation system to ensure high availability. If one AI provider is rate-limited or unavailable, the system automatically tries the next one. The order is: Groq → Cerebras → OpenRouter (which itself routes to multiple models).");

heading2("How the AI Provider System Works");
bullet([
  "The askAI() function in src/lib/aiProvider.ts is the single entry point for all AI calls.",
  "It accepts: prompt (string), systemPrompt (string), and optional config (model, temperature, maxTokens).",
  "It cycles through available providers in order, trying each one.",
  "If a provider returns an error (rate limit, timeout), it catches the error and tries the next provider.",
  "The function returns {text: string, provider: string} — the response and which provider answered.",
  "A ProviderBadge component displays which AI answered each response.",
]);

qBox(
  "What AI models does the app use?",
  "The primary model is Llama 3.3 70B running on Groq's infrastructure — Groq uses specialized Language Processing Units (LPUs) that make inference extremely fast, typically under 1 second per response. The secondary provider is Cerebras, which uses their own Wafer-Scale Engine chips. The fallback is OpenRouter, which routes to various models including Mistral and Claude. All models are Large Language Models (LLMs) — transformer-based neural networks trained on massive text datasets."
);

qBox(
  "Did you train the AI yourself?",
  "No — training a large language model from scratch requires millions of dollars of compute and terabytes of data. Instead, I used API-based inference — I call pre-trained models via their REST APIs. My contribution was the prompt engineering: designing the specific system prompts and structured output formats that make the AI return exactly the format needed for each module. For example, the math lesson prompt specifies the exact JSON schema the AI must follow, including field names, data types, and content requirements."
);

qBox(
  "What is prompt engineering and how did you use it?",
  "Prompt engineering is the practice of carefully designing the input text (prompt) sent to an AI model to get accurate, consistent, and well-formatted outputs. In ScorpStudy, I engineered prompts for each module. For example, the math lesson prompt specifies: 'Return ONLY valid JSON matching this exact schema: {topic, overview, key_concepts: [{name, description, formula}], worked_examples: [{problem, solution, explanation}]...}'. The system prompt sets the AI's persona and constraints. The user prompt provides the specific topic. Good prompt engineering is why the app gets structured, parseable JSON back instead of random text."
);

qBox(
  "How do you handle API rate limits?",
  "Each AI provider has rate limits — a maximum number of requests per minute. My system handles this at two levels. First, the provider rotation system automatically switches to a different provider if one returns a 429 (Too Many Requests) error. Second, I implemented a per-user daily quota system in Supabase that limits how many AI requests each user can make per day. This protects against abuse and keeps API costs manageable. I also have multiple API keys for each provider (stored as environment variables), which effectively multiplies the available rate limit."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 7: AUTH & SECURITY
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 7: Authentication & Security");

heading2("Authentication Flow");
bullet([
  "User visits the sign-up page and enters email + password.",
  "Supabase Auth creates a new user record in auth.users (Supabase's internal auth table).",
  "A profiles row is automatically created via a database trigger that fires on new user creation.",
  "Supabase issues a JWT (JSON Web Token) access token and a refresh token.",
  "Tokens are stored in localStorage by the Supabase client library.",
  "On every page load, the Supabase client checks for a valid session token.",
  "Protected routes (all /dashboard/* routes) check authentication via TanStack Router's beforeLoad.",
  "If the token is expired, the refresh token is used to get a new access token automatically.",
  "On sign-out, tokens are deleted and the user is redirected to the auth page.",
]);

qBox(
  "What is a JWT and how does it work?",
  "JWT stands for JSON Web Token. It's a compact, URL-safe token that contains encoded information (called claims) about the user, like their user ID and email. The token has three parts separated by dots: header (algorithm info), payload (user claims), and signature (cryptographic verification). The signature is created using a secret key held by Supabase. When my app receives a JWT, Supabase verifies the signature to confirm the token hasn't been tampered with. The token also contains an expiry time — after which it's invalid and a new one must be requested using the refresh token."
);

qBox(
  "How do you protect API keys?",
  "All API keys are stored as environment variables on the server — they are never hardcoded in the source code and never exposed to the browser. In a TanStack Start application, server-side environment variables are only accessible in server functions and API routes, not in client-side JavaScript bundles. The Supabase anon key is the only key that's safe to be public — it has no special privileges and is restricted by Row-Level Security policies."
);

qBox(
  "What prevents someone from accessing another user's data?",
  "Three layers of protection: First, JWT authentication ensures only logged-in users can access any API. Second, Supabase Row-Level Security policies enforce that every database query automatically filters by the authenticated user's ID — even if a malicious user constructs a raw API call, Supabase's RLS will prevent them from seeing other users' data. Third, the application never exposes other users' data in the UI — each component only queries data owned by the current user."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 8: FRONTEND ARCHITECTURE
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 8: Frontend Architecture");

heading2("State Management");
para("ScorpStudy uses a layered state management approach:");
bullet([
  "Local state (useState): Transient UI state like loading spinners, modal open/close, form inputs.",
  "Page state (usePageState): Custom hook backed by a module-level cache in pageState.ts. Persists state across route navigation — so if you browse to another page and come back, your selected topic and lesson content are still there. Resets on page refresh.",
  "Server state (TanStack Query): Caches data fetched from Supabase (notes, flashcard decks, quiz history) with automatic background refetching.",
  "URL state: Current route acts as state — the active dashboard section is determined by the URL path.",
]);

qBox(
  "What is Server-Side Rendering (SSR) and why does it matter?",
  "SSR means the HTML for a page is generated on the server before being sent to the browser, rather than being assembled in the browser using JavaScript. For ScorpStudy, this matters for two reasons: First, performance — users see meaningful content almost instantly instead of a blank page while JavaScript loads. Second, SEO — search engines like Google can read the full HTML content of the page, which helps with search rankings. TanStack Start handles SSR automatically, running React on both the server (Node.js/Bun) and the client."
);

qBox(
  "How does file-based routing work?",
  "TanStack Router uses the file system as the routing configuration. Each file in the src/routes/ directory corresponds to a URL path. For example, src/routes/_authenticated/dashboard.chat.tsx automatically creates the route /dashboard/chat. The _authenticated/ prefix folder applies an authentication check to all routes inside it. Route parameters, layouts, and nested routes are all defined by the file structure. This approach eliminates manual router configuration and makes the routing structure obvious by looking at the folder structure."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 9: SEO & DEPLOYMENT
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 9: SEO & Deployment");

heading2("SEO Implementation");
bullet([
  "Meta tags: title, description, keywords, author, robots, theme-color all set in root route's head().",
  "Open Graph tags: og:title, og:description, og:image (1200×630 px), og:site_name for social sharing.",
  "Twitter Card tags: summary_large_image card type for rich Twitter/X previews.",
  "JSON-LD Structured Data: WebSite, Organization, and WebApplication schemas in @graph format.",
  "Canonical URL to prevent duplicate content issues.",
  "Favicon in multiple formats: .ico (32px), .png (32px, 192px, 512px), apple-touch-icon (180px).",
  "Web Manifest (site.webmanifest) for PWA-like installation support.",
  "Sitemap.xml and robots.txt for search engine crawling guidance.",
  "Google Search Console verification tag for indexing control.",
]);

qBox(
  "What is JSON-LD and why is it important for SEO?",
  "JSON-LD (JavaScript Object Notation for Linked Data) is a structured data format that search engines like Google use to understand what a webpage is about. I embedded three schemas: WebSite (tells Google the official site name is 'ScorpStudy by Bishal'), Organization (tells Google who the founder is, what the logo looks like), and WebApplication (categorizes it as an Educational app that's free). This structured data enables Google to display rich results — like showing 'ScorpStudy by Bishal' as the site name instead of just the domain, and potentially showing sitelinks or app features in search results."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 10: GENERAL PROJECT QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 10: General Project Questions");

qBox(
  "What is the most challenging part you built?",
  "The most technically challenging part was the AI provider rotation and quota system working together reliably. I had to ensure that if Provider A fails mid-rotation, Provider B picks up seamlessly without the user seeing an error. Simultaneously, the usage quota must be incremented only after a successful response — not on a failed attempt. This required careful error handling, async/await control flow, and an atomic database upsert to prevent race conditions when multiple requests hit simultaneously."
);

qBox(
  "Did you work alone or in a team?",
  "I built this project individually. I used AI coding assistants (ChatGPT, GitHub Copilot) to help write boilerplate code, debug errors, and get suggestions — similar to how a developer would pair with a senior colleague. All architectural decisions, feature design, UX choices, prompt engineering, and integration work were done by me. Using AI tools for coding assistance is now standard practice in professional software development."
);

qBox(
  "How long did this project take?",
  "The project took approximately 2–3 months from initial concept to the current state. I started with the core AI chat feature, then progressively added modules. The first two weeks were research and setup — choosing the tech stack, setting up Supabase, and getting the first AI API call working. Each subsequent module took 3–7 days depending on complexity. The PDF chat and mind map modules were the most complex."
);

qBox(
  "What did you learn from building this?",
  "I learned how to architect a full-stack web application from scratch — handling everything from database schema design to UI component architecture. I learned how to integrate multiple third-party APIs and handle failure scenarios gracefully. I also learned a lot about user experience design: how to make complex AI responses feel natural through animations, how to structure information for students, and how to handle loading states and errors in a user-friendly way. Most importantly, I learned how to solve real problems by shipping working software."
);

qBox(
  "Is this project live? Can people use it?",
  "Yes, ScorpStudy is live at scorpstudy.in.net and is accessible to anyone with an internet connection. Users can create a free account and immediately access all 10+ modules. The app is deployed on production infrastructure with custom domain, HTTPS/TLS encryption, and global CDN delivery for fast loading speeds worldwide."
);

qBox(
  "How many users does it have?",
  "The app is currently in early launch phase. I've shared it with classmates and received positive feedback. The platform is ready to scale — Supabase's free tier supports thousands of users, and the multi-provider AI system handles traffic spikes by distributing load across providers. With the SEO optimizations I've implemented, organic discovery through Google is being built up."
);

qBox(
  "How do you handle errors in the app?",
  "I handle errors at multiple levels. At the UI level, I use Sonner toast notifications to show user-friendly error messages ('Failed to load topic — please try again'). At the API level, I have try/catch blocks around every AI call and database operation. If an AI provider fails, the error is caught and the next provider is tried. For unrecoverable errors (like a page crash), TanStack Router's errorComponent shows a clean 'This page didn't load' screen with a retry button. For stale JavaScript chunks after a new deployment, I have an auto-reload mechanism that detects chunk load failures and refreshes the page."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 11: TECHNICAL DEEP-DIVE
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 11: Technical Deep-Dive Questions");

qBox(
  "Explain how React components and props work.",
  "React is a JavaScript library for building user interfaces. A component is a reusable, self-contained piece of UI — like a button, a card, or an entire page section. Components are JavaScript functions that return JSX (JavaScript XML, which looks like HTML). Props are the inputs to a component — they allow a parent component to pass data down to a child component. For example, my TypewriterText component accepts props: text (the full string to animate), animate (boolean to start/stop), and onDone (a callback function called when animation completes). This makes the component reusable anywhere in the app."
);

qBox(
  "What is the difference between useState and useEffect?",
  "useState is a React hook that declares a state variable — a piece of data that, when changed, causes the component to re-render and update the UI. For example: const [loading, setLoading] = useState(false) — when I call setLoading(true), React re-renders the component showing a spinner. useEffect is a hook that runs side effects — code that needs to happen after a render, like fetching data, setting up timers, or subscribing to events. For example, I use useEffect to start the typewriter animation when new text arrives, and return a cleanup function to clear the interval when the component unmounts."
);

qBox(
  "What is TypeScript and why is it better than plain JavaScript?",
  "TypeScript is a superset of JavaScript that adds static type checking. This means you declare the type of every variable, function parameter, and return value. If you try to pass a string where a number is expected, TypeScript catches the error at compile time — before the code ever runs. In ScorpStudy, this prevented countless bugs: for example, the MathData type specifies exactly what fields the AI-generated JSON must have. If the AI returns unexpected data, TypeScript helps catch where assumptions break. TypeScript also dramatically improves code readability and IDE support with autocomplete and inline documentation."
);

qBox(
  "What is async/await and why do you use it?",
  "async/await is JavaScript's syntax for handling asynchronous operations — operations that take time, like API calls and database queries. Without async/await, you'd use nested callbacks or .then() promise chains, which become hard to read (callback hell). With async/await: you mark a function as async, then use await before any promise-based operation. The code reads like synchronous code but executes asynchronously. For example: const response = await askAI(prompt) — this waits for the AI API to respond before continuing to the next line, without blocking the browser UI."
);

qBox(
  "What is an API and how do you call one?",
  "API stands for Application Programming Interface. It's a way for two software systems to communicate. A REST API specifically uses HTTP — the same protocol web browsers use to load pages. To call the Groq AI API, I make an HTTP POST request to their endpoint URL, sending a JSON body with the model name, messages array, and parameters. The server processes this and returns a JSON response with the AI's generated text. In code, I use the native fetch() function: await fetch(endpoint, {method: 'POST', headers: {'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json'}, body: JSON.stringify(requestData)})."
);

qBox(
  "What is CORS and have you dealt with it?",
  "CORS stands for Cross-Origin Resource Sharing. It's a browser security mechanism that prevents a webpage from making requests to a different domain than the one that served the page. For example, scorpstudy.in.net cannot normally make requests to api.groq.com without Groq's server explicitly allowing it. In practice, all the AI API providers I use have proper CORS headers configured, allowing browser-based requests. The Supabase client handles CORS automatically. If I needed to call an API that doesn't allow CORS, I would proxy the request through my own server (which isn't restricted by CORS)."
);

qBox(
  "What is responsive design and how did you implement it?",
  "Responsive design means the layout adapts to different screen sizes — mobile phones, tablets, and desktops all get an appropriate experience. I implemented this using Tailwind CSS's responsive prefixes: sm:, md:, lg:, xl:. For example, on mobile the sidebar navigation is hidden and content takes full width. On large screens (lg:), the sidebar appears alongside the content. I also used CSS flexbox and grid for fluid layouts. The meta viewport tag ensures the browser renders at the correct scale on mobile devices."
);

qBox(
  "How do you parse the JSON returned by the AI?",
  "I built a robust extractJSON() utility function. The AI is prompted to return only valid JSON, but sometimes it wraps it in markdown code blocks like ```json ... ```. My function handles all these cases: it first tries JSON.parse() directly. If that fails, it looks for JSON wrapped in markdown code fences using a regex. It also handles cases where the AI adds extra text before or after the JSON by finding the first { and last } characters. If all extraction fails, it returns null and the UI shows a retry message."
);

qBox(
  "What is Tailwind CSS and how does it compare to regular CSS?",
  "Tailwind CSS is a utility-first CSS framework. Instead of writing custom CSS classes, you apply pre-built utility classes directly in your HTML/JSX: for example, className='flex items-center gap-4 rounded-xl bg-purple-600 px-4 py-2 text-white font-bold'. This approach eliminates the need to name CSS classes, switch between files, and manage CSS specificity conflicts. It generates only the CSS classes you actually use (tree-shaking), resulting in very small CSS bundle sizes. Compared to writing raw CSS, Tailwind is 2–3× faster for building UIs and produces more consistent designs."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 12: BUSINESS QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 12: Business & Problem-Solving Questions");

qBox(
  "How is this different from existing apps like Khan Academy or Duolingo?",
  "Khan Academy provides curated, human-authored content — it's excellent but static. Duolingo focuses specifically on language learning with gamification. ScorpStudy is fundamentally different: it's AI-generative, meaning it can create a lesson on ANY topic, not just pre-authored ones. Ask ScorpStudy to explain quantum entanglement for a 10th grader, or generate 15 practice questions on Nepal's history — it can do it instantly. ScorpStudy also combines multiple learning modalities (reading, quizzing, flashcards, mind maps, PDF analysis) in one place, and it's free with no paywalled features."
);

qBox(
  "How would you monetize this in the future?",
  "The current free model builds user base and trust. Future monetization options include: a ScorpStudy Pro subscription offering higher daily quotas, advanced AI models, priority responses, and features like offline mode. Institutional licensing where schools or colleges pay for a branded version with teacher dashboards and curriculum alignment. API access for EdTech developers. Freemium model where basic features stay free but advanced analytics, PDF export, and collaborative features are premium. I'm deliberately keeping it free now to focus on product quality and user feedback."
);

qBox(
  "What are the ethical concerns with AI in education?",
  "The main concerns are: hallucination — AI can generate confident-sounding but incorrect information, so I always recommend students verify key facts with authoritative sources. Academic integrity — students could use AI to do their homework for them rather than learning. Over-dependence — relying too much on AI might hinder the development of independent problem-solving skills. Data privacy — I only store the minimum necessary user data and use Supabase's security to protect it. My design philosophy addresses these by framing the AI as a tutor that explains and guides, not a tool that just gives answers — the practice questions and exercises are designed to make students do the work."
);

qBox(
  "How does ScorpStudy scale if it gets many users?",
  "Supabase scales automatically — it's built on AWS and handles millions of users. The AI API calls scale horizontally — more users just means more API calls, distributed across multiple providers. The frontend is a static React build served via CDN (Content Delivery Network), which can handle millions of simultaneous users. The per-user daily quota system also acts as a natural traffic limiter. For extreme scale, I would add a Redis cache layer for frequently-requested AI responses (like popular math topics) to avoid redundant API calls."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 13: CODE QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 13: Code & Implementation Questions");

qBox(
  "Can you show me a code snippet and explain it?",
  "Here's the core of the AI provider rotation in askAI():\n\nconst providers = [groqProvider, cerebrasProvider, openRouterProvider];\nfor (const provider of providers) {\n  try {\n    const result = await provider.call(prompt, systemPrompt);\n    return { text: result.text, provider: provider.name };\n  } catch (error) {\n    console.warn('Provider failed:', provider.name, error);\n    continue; // try next provider\n  }\n}\nthrow new Error('All providers failed');\n\nThis iterates through providers in priority order. If one throws an error (network issue, rate limit), we catch it and continue to the next. We only throw a final error if ALL providers fail.",
  "If asked to show code, go to the actual source files. Walk judges through the logic calmly."
);

qBox(
  "How did you handle the case where AI returns invalid JSON?",
  "I built a multi-strategy extractJSON() function. Strategy 1: Direct parse — JSON.parse(rawText). Strategy 2: Strip markdown code fences — regex to extract content between ```json and ```. Strategy 3: Find outermost braces — find the index of the first { and last } and parse only that substring. Strategy 4: Find outermost brackets for arrays — same but for [ and ]. If all strategies fail, the function returns null, and the UI shows a user-friendly error message with a retry button. This defensive approach means the app handles AI inconsistencies gracefully rather than crashing."
);

qBox(
  "What design patterns did you use?",
  "Several patterns appear throughout the codebase. The Provider Pattern: the AI provider system abstracts different providers behind a common interface. The Custom Hook Pattern: useUsageLimit, usePageState encapsulate reusable stateful logic. The Compound Component Pattern: AskPanel combines input, message list, and send button into one reusable component used across Math, Science, and Grammar pages. The Module Pattern: each learning page is self-contained with its own types, constants, sub-components, and main page component in a single file. The Repository Pattern: all Supabase operations are isolated in specific function calls rather than scattered throughout components."
);

qBox(
  "How do you manage multiple API keys?",
  "I have multiple API keys for each provider (e.g., GROQ_API_KEY_1 through GROQ_API_KEY_6) stored as environment variables. The AI provider module randomly selects a key from the available set for each request. This effectively multiplies the rate limit — if each key allows 30 requests per minute, 6 keys give 180 requests per minute total. Keys are never hardcoded in source code — they exist only as server-side environment variables, invisible to browser clients and not committed to version control."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 14: DIFFICULT TRICK QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 14: Difficult / Trick Questions");

qBox(
  "How do you know the AI is giving correct answers?",
  "Honestly, I can't guarantee 100% accuracy — this is a fundamental limitation of current AI technology called 'hallucination'. Large language models can generate fluent, confident-sounding text that is factually wrong. To mitigate this, I've implemented several approaches: the app clearly says the AI is a study aid, not a definitive source; practice questions are structured so students think critically rather than just accepting answers; for math and science topics, I prompt the AI to show step-by-step working so errors are visible; and I recommend students cross-check important facts with their textbooks. In future versions, I plan to implement retrieval-augmented generation (RAG) where the AI answers are grounded in verified curriculum content."
);

qBox(
  "Couldn't students just use ChatGPT for free? Why use ScorpStudy?",
  "Great question. ChatGPT is a general-purpose chatbot — it's excellent at conversation but not optimized for studying. ScorpStudy provides structured, curriculum-aligned learning experiences: Math topics return a complete lesson with formulas, worked examples, and practice questions in a beautifully formatted UI — not just a chat response. The flashcard system implements spaced repetition. The quiz generator creates proper MCQs with timing and scoring. The mind map visually organizes knowledge. Students can analyze their own PDF documents. All of this happens in a purpose-built interface designed for learning, with a saved account that tracks their content. ChatGPT doesn't persist flashcard decks, quiz history, or notes — ScorpStudy does."
);

qBox(
  "What happens if the AI APIs shut down or change pricing?",
  "This is a real risk and I've designed for it. The multi-provider architecture is specifically meant to avoid single points of failure. If Groq shuts down, Cerebras and OpenRouter still work. OpenRouter itself routes to 100+ models from different companies. If pricing becomes prohibitive, I can switch primary providers in the aiProvider.ts configuration file without changing any other code. Long-term, open-source models running on local infrastructure (like Ollama with Llama) could completely replace API dependence. The app's architecture is provider-agnostic — providers are pluggable modules."
);

qBox(
  "Isn't this just a wrapper around ChatGPT?",
  "No, and this is an important distinction. A 'wrapper' implies minimal added value — just a different UI for the same thing. ScorpStudy adds substantial value: First, purpose-built prompt engineering for each module produces structured, educationally-formatted content rather than generic chat. Second, the backend infrastructure — Supabase for persistent data, multi-provider routing for reliability, usage quota management. Third, the frontend experience — a full learning management system with 10+ specialized modules, animations, progress tracking, structured content rendering. Fourth, the PDF analysis capability requires client-side PDF parsing, text extraction, and context injection. These are non-trivial engineering contributions on top of the base AI models."
);

qBox(
  "What if a student uses this to cheat on exams?",
  "This concern applies to any educational technology — calculators, search engines, and Wikipedia all faced the same criticism. The educational community has ultimately adapted by redesigning assessments to test understanding rather than memorization. ScorpStudy is designed as a learning tool, not an answer machine — it explains concepts, asks practice questions, and generates exercises. Responsible use is encouraged in the app's design. In a professional context, I would implement features like teacher oversight mode, assignment-specific restrictions, and academic integrity guidelines. The same way calculators are allowed in math exams but you still need to understand the concepts — AI tutors should be used to learn, not to bypass learning."
);

qBox(
  "The app uses third-party AI — what's your original contribution?",
  "My original contributions are: the complete system architecture and database design; the multi-provider rotation and quota system; the prompt engineering for all 10+ modules that produces structured, educationally-valuable outputs; the custom TypewriterText animation component; the extractJSON robust parser; the mind map SVG layout algorithm using trigonometric radial positioning; the client-side PDF text extraction and context injection pipeline; the pageState persistence system for cross-route state; all UI/UX design, component architecture, and visual design decisions; SEO implementation with structured data, favicons, and OG images; and the deployment and domain configuration. The AI APIs are like a database engine — they provide raw capability, but the application logic, architecture, and user experience are entirely my work."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 15: PERSONAL & PROCESS QUESTIONS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 15: Personal & Process Questions");

qBox(
  "What resources did you use to learn the technologies?",
  "I used a combination of official documentation (React docs, Supabase docs, TanStack docs), YouTube tutorials for visual explanations of concepts I was unfamiliar with, Stack Overflow for debugging specific errors, and AI coding assistants (ChatGPT, GitHub Copilot) for writing boilerplate code and getting unstuck. I also followed several full-stack web development courses to understand best practices. The most valuable resource was actually building the project itself — many concepts only clicked when I encountered real problems and had to solve them."
);

qBox(
  "What bugs did you encounter and how did you fix them?",
  "Several memorable ones. The most complex was a hydration mismatch in the SSR setup — the HTML rendered on the server didn't match what the React client expected, causing errors. I traced this to inline script tags in the page head conflicting with TanStack Start's hydration process, and fixed it by restructuring how structured data was injected. Another significant bug was a mind map layout issue where outer nodes were clipping outside the SVG viewport — I fixed it by calculating the correct viewBox dimensions based on the maximum node radius plus padding. A quota system race condition where concurrent requests could both increment below the limit — fixed with an atomic database upsert operation."
);

qBox(
  "If you could start over, what would you do differently?",
  "I would establish the database schema and API contracts first before building any UI. I started coding the frontend before fully thinking through what data I needed to store, which caused some refactoring. I would also write more comprehensive TypeScript types upfront — having strict types from day one would have caught several runtime errors earlier. And I would implement automated testing sooner — currently the app has no unit tests, which makes refactoring riskier. These are all lessons I'll apply to future projects."
);

qBox(
  "What is the biggest limitation of your current implementation?",
  "The biggest technical limitation is the lack of true streaming responses. Currently, the AI response is received as a complete block, then animated with the typewriter effect locally. True streaming would show each word as it's generated by the AI (like ChatGPT does), which would feel even more responsive. This requires the server to proxy a streaming HTTP response rather than buffering the complete response — a more complex implementation that I plan to add. The second limitation is that AI-generated content is not cached — if two users ask about the same math topic, two separate API calls are made. A Redis cache layer would fix this."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 16: FUTURE PLANS
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 16: Future Plans & Improvements");

heading2("Planned Features");
bullet([
  "True streaming AI responses — characters appear as the AI generates them, not after buffering.",
  "Mobile app — React Native version for iOS and Android.",
  "Offline mode — Service worker caching for core features without internet.",
  "Teacher portal — Assign topics, track student progress, set class quizzes.",
  "NEB curriculum alignment — Lessons specifically aligned to Nepal's national curriculum.",
  "Voice input — Ask questions by speaking instead of typing.",
  "Image question solver — Upload a photo of a question from a textbook and get an explanation.",
  "Collaborative study groups — Share notes, flashcard decks, and quizzes with classmates.",
  "Progress analytics — Dashboard showing study streaks, topics covered, quiz performance over time.",
  "RAG (Retrieval-Augmented Generation) — Ground AI answers in verified curriculum documents.",
]);

qBox(
  "How would you add real-time collaboration?",
  "I would use Supabase Realtime — a WebSocket-based feature built into Supabase that broadcasts database changes to connected clients. For example, if two students are working on a shared notes document, Supabase Realtime would push character-level changes to both clients. For more complex operational transformation (like Google Docs), I would implement a CRDT (Conflict-free Replicated Data Type) algorithm that merges concurrent edits without conflicts. This is a graduate-level computer science problem, and libraries like Yjs provide ready-made CRDT implementations for web applications."
);

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 17: QUICK REFERENCE CHEAT SHEET
// ══════════════════════════════════════════════════════════════════════════════
heading1("Section 17: Quick-Reference Cheat Sheet");

heading2("Key Numbers to Remember");
bullet([
  "10+ learning modules in the platform",
  "3 AI providers in the rotation (Groq, Cerebras, OpenRouter)",
  "6 API keys per provider for rate limit multiplication",
  "PostgreSQL (relational database) via Supabase",
  "JWT tokens expire and auto-refresh via refresh tokens",
  "1200×630 px OG image for social media previews",
  "1500×1300 px SVG viewBox for mind maps",
  "3000 character limit per message in AI conversation history",
]);

heading2("Key Terms Glossary");
tableRow("Term", "Simple Definition", "Used In", true);
tableRow("SSR", "HTML built on server before browser sees it", "TanStack Start, SEO");
tableRow("JWT", "Encrypted token proving who you are", "Supabase Auth");
tableRow("RLS", "Database rules: users see only their own data", "Supabase Security");
tableRow("LLM", "AI language model (Llama, Gemini, etc.)", "Groq, Cerebras APIs");
tableRow("Prompt Engineering", "Crafting inputs to get desired AI outputs", "All AI modules");
tableRow("CORS", "Browser security: controls which domains can call APIs", "AI API calls");
tableRow("Hydration", "React taking over a server-rendered HTML page", "SSR setup");
tableRow("Upsert", "Insert if not exists, else update", "daily_usage quota");
tableRow("Atomic Op", "Database operation that completes fully or not at all", "Quota increment");
tableRow("CDN", "Servers worldwide that cache and deliver static files fast", "Deployment");
tableRow("JSON-LD", "Structured data format for search engines", "SEO, schema.org");
tableRow("RAG", "AI using retrieved documents as factual context", "Future feature");
tableRow("CRDT", "Algorithm for merging concurrent edits without conflicts", "Future collab");
tableRow("PWA", "Web app installable like a native app", "site.webmanifest");

heading2("One-Liners for Each Module");
tableRow("Module", "What It Does", "Key Tech", true);
tableRow("Bishal's Assistant", "24/7 AI tutor for any question", "Multi-turn chat, typewriter");
tableRow("Math Tutor", "Structured lessons with formulas", "JSON schema prompting");
tableRow("Science Tutor", "Physics/Chem/Bio with experiments", "Hierarchical sidebar");
tableRow("Grammar", "Rules, examples, exercises", "Learn/Practice tabs");
tableRow("PDF Chat", "Ask questions about uploaded PDFs", "pdfjs-dist, context inject");
tableRow("Quiz Generator", "MCQ quizzes with scoring", "JSON array + client timer");
tableRow("Smart Notes", "Write + AI-enhance + save notes", "Supabase CRUD");
tableRow("Flashcards", "Flip card decks for memorization", "CSS 3D transform");
tableRow("Mind Map", "Visual topic diagrams", "Custom SVG + trig math");
tableRow("Mock Test", "Timed exam simulation", "Timer + result analysis");
tableRow("Translator", "Translate any text to any language", "AI prompt, language pair");

heading2("Final Confidence Tips");
doc.rect(55, doc.y, W, 120).fill(LIGHT_BG);
const tipY = doc.y - 116;
const tips = [
  "✅  If you don't know an answer, say: 'That's a great question. I haven't explored that specific aspect yet, but my next step would be...'",
  "✅  Walk judges through a live demo if possible — showing is more powerful than telling.",
  "✅  When asked about something complex, start with the simple concept first, then go deeper.",
  "✅  You BUILT this. Be confident. No one in the room knows this project better than you.",
  "✅  AI helped you code — that's not a weakness, it's modern professional practice. Own it.",
];
tips.forEach((t, i) => {
  doc.fillColor(i === 3 ? PURPLE : DARK).font(i === 3 ? "Helvetica-Bold" : "Helvetica").fontSize(10)
     .text(t, 62, tipY + 8 + i * 22, { width: W - 14 });
});
doc.moveDown(6);

// ─── Footer on last page ───────────────────────────────────────────────────
doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill(PURPLE);
doc.fillColor("white").font("Helvetica").fontSize(9)
   .text("ScorpStudy by Bishal  •  scorpstudy.in.net  •  Built by Bishal Bishwokarma  •  CONFIDENTIAL",
     55, doc.page.height - 27, { width: W, align: "center" });

doc.end();
console.log("✅ PDF generated at:", OUT);
