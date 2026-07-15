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

/** Scores all 510 careers against a free-text interest string and returns the best matches. */
export const findCareersByInterest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => InterestInput.parse(d))
  .handler(async ({ data }): Promise<CareerIndex[]> => {
    const tokens = tokenize(data.interest);
    if (tokens.length === 0) return [];

    // Deduplicate tokens so "coding coding" doesn't double-score
    const uniqueTokens = [...new Set(tokens)];

    const scored = careersData.map((c) => {
      let score = 0;
      const titleTokens = tokenize(c.title);
      const catTokens = tokenize(c.category);
      const skillTokens = c.skills.flatMap(s => tokenize(s));
      const overviewTokens = tokenize(c.overview.slice(0, 400));
      const rolesTokens = tokenize(c.roles.slice(0, 200));

      for (const tok of uniqueTokens) {
        // Exact match scores higher than substring match
        const titleExact = titleTokens.some(t => t === tok);
        const titlePartial = !titleExact && titleTokens.some(t => t.includes(tok) || tok.includes(t));
        if (titleExact)   score += 10;
        else if (titlePartial) score += 4;

        const catExact = catTokens.some(t => t === tok);
        const catPartial = !catExact && catTokens.some(t => t.includes(tok) || tok.includes(t));
        if (catExact)   score += 8;
        else if (catPartial) score += 3;

        const skillExact = skillTokens.some(t => t === tok);
        const skillPartial = !skillExact && skillTokens.some(t => t.includes(tok) || tok.includes(t));
        if (skillExact)   score += 5;
        else if (skillPartial) score += 2;

        if (overviewTokens.some(t => t === tok)) score += 2;
        if (rolesTokens.some(t => t === tok))    score += 2;
      }
      return { career: c, score };
    });

    // Require a meaningful score — at least 5 points so weak matches are excluded
    const minScore = Math.max(5, uniqueTokens.length * 2);
    const filtered = scored.filter(s => s.score >= minScore);

    // Also require score to be at least 30% of the max score found
    const maxScore = filtered.length > 0 ? Math.max(...filtered.map(s => s.score)) : 0;
    const threshold = maxScore * 0.30;

    return filtered
      .filter(s => s.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(s => ({
        id: s.career.id,
        title: s.career.title,
        category: s.career.category,
        salaryBands: s.career.salaryBands,
      }));
  });
