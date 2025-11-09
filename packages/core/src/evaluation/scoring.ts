const KEY_TERM_MATCH_THRESHOLD = 0.5;

const ACTION_WORDS = new Set([
  "use",
  "avoid",
  "prefer",
  "replace",
  "consider",
  "ensure",
  "remove",
  "add",
]);

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
]);

const ERROR_PREFIXES = [
  "error:",
  "err:",
  "vs code command failed",
  "exception",
  "traceback",
  "no response file was generated",
  "timed out",
  "cli not found",
];

export interface HeuristicScore {
  readonly score: number;
  readonly hits: readonly string[];
  readonly misses: readonly string[];
  readonly hitCount: number;
  readonly totalAspects: number;
  readonly rawAspects: readonly string[];
}

/**
 * Extract individual evaluation aspects from the expected assistant response.
 */
export function extractAspects(expectedResponse: string): readonly string[] {
  const lines = expectedResponse.split(/\r?\n/).map((line) => line.trim());
  const aspects: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }

    const bulletMatch = /^([-*•]|[0-9]+\.)\s*(.+)$/.exec(line);
    if (bulletMatch) {
      const normalized = normalizeAspect(bulletMatch[2]);
      if (normalized.length > 0) {
        aspects.push(normalized);
      }
      continue;
    }

    const lowered = line.toLowerCase();
    if (Array.from(ACTION_WORDS).some((word) => lowered.startsWith(word))) {
      const normalized = normalizeAspect(line);
      if (normalized.length > 0) {
        aspects.push(normalized);
      }
    }
  }

  return aspects;
}

/**
 * Determine which aspects were covered by the candidate response.
 */
export function calculateHits(
  candidateResponse: string,
  expectedAspects: readonly string[],
): readonly string[] {
  const { normalizedText, words } = normalizeCandidate(candidateResponse);
  const hits: string[] = [];

  for (const aspect of expectedAspects) {
    if (matchesAspect(aspect, normalizedText, words)) {
      hits.push(aspect);
    }
  }

  return hits;
}

/**
 * Determine which aspects were not satisfied by the candidate response.
 */
export function calculateMisses(
  candidateResponse: string,
  expectedAspects: readonly string[],
  resolvedHits?: readonly string[],
): readonly string[] {
  const hits = new Set(resolvedHits ?? calculateHits(candidateResponse, expectedAspects));
  return expectedAspects.filter((aspect) => !hits.has(aspect));
}

/**
 * Evaluate the candidate response against the expected aspects.
 */
export function scoreCandidateResponse(
  candidateResponse: string,
  expectedAspects: readonly string[],
): HeuristicScore {
  if (expectedAspects.length === 0) {
    if (isErrorLike(candidateResponse)) {
      return {
        score: 0,
        hits: [],
        misses: ["Model produced an error instead of an answer."],
        hitCount: 0,
        totalAspects: 0,
        rawAspects: [],
      };
    }

    return {
      score: 1,
      hits: [],
      misses: [],
      hitCount: 0,
      totalAspects: 0,
      rawAspects: [],
    };
  }

  const hits = calculateHits(candidateResponse, expectedAspects);
  const misses = expectedAspects.filter((aspect) => !hits.includes(aspect));
  const score = expectedAspects.length > 0 ? hits.length / expectedAspects.length : 0;

  return {
    score,
    hits,
    misses,
    hitCount: hits.length,
    totalAspects: expectedAspects.length,
    rawAspects: expectedAspects,
  };
}

/**
 * Detect common error-prefixed outputs from providers.
 */
export function isErrorLike(text: string | undefined | null): boolean {
  if (!text) {
    return false;
  }
  const lowered = text.trim().toLowerCase();
  return ERROR_PREFIXES.some((prefix) => lowered.startsWith(prefix));
}

function normalizeAspect(aspect: string): string {
  const sanitized = aspect
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized;
}

function normalizeCandidate(candidate: string): {
  readonly normalizedText: string;
  readonly words: ReadonlySet<string>;
} {
  const lowered = candidate.toLowerCase();
  const normalizedText = lowered.replace(/[^\w\s]/g, " ");
  const words = new Set(normalizedText.split(/\s+/).filter((word) => word.length > 0));
  return { normalizedText, words };
}

function matchesAspect(
  aspect: string,
  candidateNormalized: string,
  candidateWords: ReadonlySet<string>,
): boolean {
  const keyTerms = extractKeyTerms(aspect);
  if (keyTerms.length === 0) {
    return false;
  }

  const matches = keyTerms.filter((term) => candidateWords.has(term)).length;
  const ratio = matches / keyTerms.length;
  if (ratio >= KEY_TERM_MATCH_THRESHOLD) {
    return true;
  }

  const aspectWords = aspect.split(" ");
  if (aspectWords.length >= 2) {
    for (let index = 0; index < aspectWords.length - 1; index += 1) {
      const phrase = `${aspectWords[index]} ${aspectWords[index + 1]}`;
      if (candidateNormalized.includes(phrase)) {
        return true;
      }
    }
  }

  return false;
}

function extractKeyTerms(aspect: string, maxTerms = 5): string[] {
  const terms: string[] = [];
  const words = aspect.split(" ");

  for (const word of words) {
    if (word.length <= 2) {
      continue;
    }
    if (STOP_WORDS.has(word)) {
      continue;
    }
    terms.push(word);
    if (terms.length >= maxTerms) {
      break;
    }
  }

  return terms;
}
