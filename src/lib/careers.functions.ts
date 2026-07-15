import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// This import is server-only — the JSON never reaches the client bundle.
import careersDataRaw from "../data/careers.json" assert { type: "json" };
const careersData = careersDataRaw as unknown as CareerFull[];

const STOP_WORDS = new Set(["i","a","an","the","and","or","but","in","on","at","to","for","of","with","by","from","my","me","am","is","are","was","were","be","been","have","has","had","do","does","did","will","would","could","should","may","might","can","like","love","want","wish","hope","dream","also","very","really","quite","some","any","all","more","most","just","than","that","this","these","those","they","them","their","we","our","you","your","it","its","who","what","when","where","how","why","which","not","no","yes","so","if","as","about","into","over","after","before","between","through","during","each","few","both","only","own","same","too","then","there","here","now","up","out","off","down","back","looking","look","find","get","go","make","become","work","working","works","good","great","best","new","old"]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

export type CareerIndex = {
  id: string;
  title: string;
  category: string;
  salaryBands: { entry: string; mid: string; senior: string };
};

export type CareerFull = {
  id: string;
  title: string;
  category: string;
  overview: string;
  roles: string;
  whyChoose: string;
  scope: string;
  salaryNepal: string;
  salaryAbroad: string;
  skills: string[];
  skillsIntro: string;
  growth: string;
  salaryBands: { entry: string; mid: string; senior: string };
  foreignSalary: { gulf: string; western: string; australia: string };
};

/** Returns lightweight index (id, title, category, salaryBands) for all 510 careers. */
export const getCareersIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<CareerIndex[]> => {
    return careersData.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      salaryBands: c.salaryBands,
    }));
  },
);

const CareerDetailInput = z.object({ id: z.string().min(1).max(10) });

/** Returns the full career record for a given id. */
export const getCareerDetail = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => CareerDetailInput.parse(d))
  .handler(async ({ data }): Promise<CareerFull | null> => {
    const career = careersData.find((c) => c.id === data.id);
    return career ?? null;
  });

const InterestInput = z.object({ interest: z.string().min(1).max(500) });

/** Scores all 510 careers against a free-text interest string and returns the top matches. */
export const findCareersByInterest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => InterestInput.parse(d))
  .handler(async ({ data }): Promise<CareerIndex[]> => {
    const tokens = tokenize(data.interest);
    if (tokens.length === 0) return [];

    const scored = careersData.map((c) => {
      let score = 0;
      const titleTokens = tokenize(c.title);
      const catTokens = tokenize(c.category);
      const skillTokens = c.skills.flatMap(s => tokenize(s));
      const overviewTokens = tokenize(c.overview.slice(0, 300));

      for (const tok of tokens) {
        if (titleTokens.some(t => t.includes(tok) || tok.includes(t))) score += 6;
        if (catTokens.some(t => t.includes(tok) || tok.includes(t))) score += 4;
        if (skillTokens.some(t => t.includes(tok) || tok.includes(t))) score += 2;
        if (overviewTokens.some(t => t.includes(tok) || tok.includes(t))) score += 1;
      }
      return { career: c, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map(s => ({
        id: s.career.id,
        title: s.career.title,
        category: s.career.category,
        salaryBands: s.career.salaryBands,
      }));
  });
