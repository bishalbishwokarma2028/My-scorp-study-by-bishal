/**
 * PDF text extraction utility.
 *
 * - Uses the locally-bundled pdf.js worker (no CDN dependency).
 * - Extracts text from up to MAX_PAGES pages with proper line/paragraph structure.
 * - If a page yields no text (scanned/image-only PDF), it renders the page to
 *   a canvas, converts it to JPEG, and sends it to the vision AI.
 * - Returns up to MAX_CHARS characters of combined text.
 */

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PAGES = 50;
const MAX_CHARS = 50_000;
const MIN_TEXT_PER_PAGE = 30;
const MAX_OCR_IMAGE_BASE64 = 2_500_000;

type VisionFn = (opts: { data: { prompt: string; imageBase64: string; mimeType: string } }) => Promise<{ text: string; provider?: string }>;

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  pagesProcessed: number;
  scannedPages: number;
  ocrFailedPages: number;
  truncated: boolean;
}

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  return pdfjs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageToBase64(page: any): Promise<string | null> {
  try {
    for (const scale of [1.5, 1.15, 0.9]) {
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      await page.render({ canvasContext: ctx, viewport }).promise;
      for (const quality of [0.72, 0.52]) {
        const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        if (base64.length <= MAX_OCR_IMAGE_BASE64) {
          canvas.width = 0;
          canvas.height = 0;
          return base64;
        }
      }
      canvas.width = 0;
      canvas.height = 0;
    }
    return null;
  } catch {
    return null;
  }
}

export async function extractPdfText(
  file: File,
  analyzeImage?: VisionFn,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfExtractResult> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;

  const pagesToProcess = Math.min(doc.numPages, MAX_PAGES);
  let combined = "";
  let scannedPages = 0;
  let ocrFailedPages = 0;
  let pagesProcessed = 0;

  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const pageText = (content.items as Array<{ str?: string; hasEOL?: boolean }>)
      .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : " "))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (pageText.length >= MIN_TEXT_PER_PAGE) {
      combined += `\n--- Page ${i} ---\n${pageText}`;
    } else if (analyzeImage) {
      scannedPages++;
      const base64 = await pageToBase64(page);
      if (base64) {
        try {
          const res = await analyzeImage({
            data: {
              prompt:
                "Extract ALL visible text from this page exactly as it appears. Preserve headings, lists, tables and all content. Output only the extracted text, no commentary.",
              imageBase64: base64,
              mimeType: "image/jpeg",
            },
          });
          if (res.provider !== "none" && res.text && res.text.length > 10) {
            combined += `\n--- Page ${i} (scanned) ---\n${res.text}`;
          } else {
            ocrFailedPages++;
          }
        } catch {
          ocrFailedPages++;
        }
      } else {
        ocrFailedPages++;
      }
    } else {
      ocrFailedPages++;
    }

    pagesProcessed = i;
    onProgress?.(pagesProcessed, pagesToProcess);
    if (combined.length > MAX_CHARS) break;
  }

  return {
    text: combined.trim().slice(0, MAX_CHARS),
    pageCount: doc.numPages,
    pagesProcessed,
    scannedPages,
    ocrFailedPages,
    truncated: doc.numPages > pagesToProcess || combined.length > MAX_CHARS,
  };
}
