import "server-only";

export const AI_FLUFF_PHRASES = [
  "in today's fast-paced digital world",
  "in today's fast-paced world",
  "in today's digital landscape",
  "delve into",
  "delving into",
  "game-changer",
  "game changer",
  "testament to",
  "unlocking the power",
  "unlock the power",
  "it goes without saying",
  "seamlessly integrated",
  "at the end of the day",
  "plays a vital role",
  "plays an important role",
  "look no further",
  "without further ado",
  "beacon of hope",
  "in conclusion,",
  "realm of",
];

export type SectionData = {
  heading: string;
  text: string;
  paragraphs: string[];
};

/**
 * Extracts sections (heading + body text) from HTML.
 */
export function extractSectionsFromHtml(html: string): SectionData[] {
  const sections: SectionData[] = [];
  // Split HTML by headings H1-H6
  const parts = html.split(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi);

  let currentHeading = "Overview";
  let currentTextParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Heading match
      if (currentTextParts.length > 0) {
        const text = currentTextParts.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const paragraphs = currentTextParts
          .join("\n")
          .split(/<\/p>|<br\s*\/?>/gi)
          .map((p) => p.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
          .filter(Boolean);

        if (text) {
          sections.push({ heading: currentHeading, text, paragraphs });
        }
        currentTextParts = [];
      }
      currentHeading = parts[i].replace(/<[^>]+>/g, "").trim();
    } else {
      // Content chunk
      if (parts[i].trim()) {
        currentTextParts.push(parts[i]);
      }
    }
  }

  if (currentTextParts.length > 0) {
    const text = currentTextParts.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const paragraphs = currentTextParts
      .join("\n")
      .split(/<\/p>|<br\s*\/?>/gi)
      .map((p) => p.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (text) {
      sections.push({ heading: currentHeading, text, paragraphs });
    }
  }

  return sections;
}

/**
 * Generates 3-grams for text.
 */
export function getNGrams(text: string, n = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const nGrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    nGrams.add(words.slice(i, i + n).join(" "));
  }
  return nGrams;
}

/**
 * Computes Jaccard Similarity between two texts based on 3-grams.
 */
export function calculateSectionSimilarity(textA: string, textB: string): number {
  const nGramsA = getNGrams(textA, 3);
  const nGramsB = getNGrams(textB, 3);

  if (nGramsA.size === 0 || nGramsB.size === 0) return 0;

  let intersectionCount = 0;
  Array.from(nGramsA).forEach((gram) => {
    if (nGramsB.has(gram)) {
      intersectionCount++;
    }
  });

  const unionCount = nGramsA.size + nGramsB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Finds repeated sentences across sections.
 */
export function detectRepeatedSentences(html: string): string[] {
  const blockCleaned = html
    .replace(/<\/(h[1-6]|p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const sentences = blockCleaned
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(normalized)) {
      duplicates.add(sentence);
    } else {
      seen.add(normalized);
    }
  }

  return Array.from(duplicates);
}

/**
 * Detects AI fluff phrases in HTML content.
 */
export function detectGenericFluff(html: string): string[] {
  const lowerHtml = html.toLowerCase();
  const detected: string[] = [];

  for (const phrase of AI_FLUFF_PHRASES) {
    if (lowerHtml.includes(phrase)) {
      detected.push(phrase);
    }
  }

  return detected;
}

export type ContentAuditReport = {
  maxSectionSimilarity: number;
  flaggedSections: Array<{
    sectionA: string;
    sectionB: string;
    similarity: number;
  }>;
  repeatedSentences: string[];
  fluffPhrases: string[];
  lowInfoParagraphs: string[];
};

/**
 * Runs a comprehensive content quality audit on article HTML.
 */
export function auditContentQuality(html: string): ContentAuditReport {
  const sections = extractSectionsFromHtml(html);
  const flaggedSections: ContentAuditReport["flaggedSections"] = [];
  let maxSectionSimilarity = 0;

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const similarity = calculateSectionSimilarity(sections[i].text, sections[j].text);
      if (similarity > maxSectionSimilarity) {
        maxSectionSimilarity = similarity;
      }
      if (similarity >= 0.2) {
        flaggedSections.push({
          sectionA: sections[i].heading,
          sectionB: sections[j].heading,
          similarity: Number(similarity.toFixed(3)),
        });
      }
    }
  }

  const repeatedSentences = detectRepeatedSentences(html);
  const fluffPhrases = detectGenericFluff(html);

  // Identify low info paragraphs (paragraphs < 15 words or containing only tautology)
  const lowInfoParagraphs: string[] = [];
  for (const sec of sections) {
    for (const p of sec.paragraphs) {
      const wordCount = p.split(/\s+/).filter(Boolean).length;
      if (wordCount < 8 && !p.toLowerCase().includes("http")) {
        lowInfoParagraphs.push(p);
      }
    }
  }

  return {
    maxSectionSimilarity: Number(maxSectionSimilarity.toFixed(3)),
    flaggedSections,
    repeatedSentences,
    fluffPhrases,
    lowInfoParagraphs,
  };
}

/**
 * Automatically cleans HTML by stripping fluff phrases and removing duplicate paragraphs.
 */
export function autoCleanHtml(html: string): {
  cleanedHtml: string;
  removedParagraphsCount: number;
  cleanedFluffCount: number;
} {
  let cleanedHtml = html;
  let cleanedFluffCount = 0;

  // 1. Remove fluff phrases
  for (const phrase of AI_FLUFF_PHRASES) {
    const regex = new RegExp(`\\b${phrase.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}\\b,?`, "gi");
    if (regex.test(cleanedHtml)) {
      cleanedHtml = cleanedHtml.replace(regex, "");
      cleanedFluffCount++;
    }
  }

  // 2. Remove duplicate paragraphs
  const paragraphs = cleanedHtml.split(/(?=<p>|<h[1-6]>)/gi);
  const seenParagraphs = new Set<string>();
  const filteredParts: string[] = [];
  let removedParagraphsCount = 0;

  for (const part of paragraphs) {
    const isParagraph = /^\s*<p>/i.test(part);
    if (!isParagraph) {
      filteredParts.push(part);
      continue;
    }

    const plain = part.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (seenParagraphs.has(plain)) {
      removedParagraphsCount++;
      continue;
    }

    seenParagraphs.add(plain);
    filteredParts.push(part);
  }

  cleanedHtml = filteredParts.join("").replace(/\n{3,}/g, "\n\n").trim();

  return {
    cleanedHtml,
    removedParagraphsCount,
    cleanedFluffCount,
  };
}
