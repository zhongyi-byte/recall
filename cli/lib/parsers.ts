export type ImportCard = {
  front: string;
  back: string;
  source?: string;
  tags?: string[];
};

export function parseImportPayload(input: string): ImportCard[] {
  return parseImportPayloadWithFormat(input, "auto");
}

export function parseImportPayloadWithFormat(
  input: string,
  format: "auto" | "json" | "qa" | "anki-table" | "anki-tsv"
): ImportCard[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [];
  }

  if (format === "json") {
    return parseJsonCards(trimmed);
  }

  if (format === "qa") {
    return parseMarkdownCards(trimmed);
  }

  if (format === "anki-table") {
    return parseAnkiMarkdownTable(trimmed);
  }

  if (format === "anki-tsv") {
    return parseAnkiTsv(trimmed);
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonCards(trimmed);
  }

  if (looksLikeAnkiMarkdownTable(trimmed)) {
    return parseAnkiMarkdownTable(trimmed);
  }

  if (looksLikeAnkiTsv(trimmed)) {
    return parseAnkiTsv(trimmed);
  }

  return parseMarkdownCards(trimmed);
}

function parseJsonCards(input: string): ImportCard[] {
  const parsed = JSON.parse(input);
  const cards = Array.isArray(parsed) ? parsed : Array.isArray(parsed.cards) ? parsed.cards : null;
  if (!cards) {
    throw new Error("JSON import expects an array or `{ cards: [...] }`.");
  }

  return cards.map((card: unknown) => {
    if (!card || typeof card !== "object") {
      throw new Error("Invalid JSON card payload.");
    }

    return {
      front: String((card as { front?: string; q?: string }).front ?? (card as { q?: string }).q ?? "").trim(),
      back: String((card as { back?: string; a?: string }).back ?? (card as { a?: string }).a ?? "").trim(),
      source: typeof (card as { source?: unknown }).source === "string" ? (card as { source: string }).source : undefined,
      tags: Array.isArray((card as { tags?: unknown[] }).tags)
        ? (card as { tags: unknown[] }).tags.filter((tag): tag is string => typeof tag === "string")
        : undefined
    };
  });
}

function parseMarkdownCards(input: string): ImportCard[] {
  return input
    .split(/\n\s*---+\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const match = block.match(/^Q:\s*([\s\S]*?)\nA:\s*([\s\S]+)$/m);
      if (!match) {
        throw new Error("Markdown import expects `Q:` / `A:` blocks separated by `---`.");
      }
      return {
        front: match[1].trim(),
        back: match[2].trim()
      };
    });
}

function looksLikeAnkiMarkdownTable(input: string) {
  return /\|\s*Type\s*\|\s*Front\s*\|\s*Back\s*\|\s*Extra\s*\|\s*Tags\s*\|\s*Source\s*\|/i.test(input);
}

function looksLikeAnkiTsv(input: string) {
  return /^Type\tFront\tBack\tExtra\tTags\tSource$/im.test(input);
}

function parseAnkiMarkdownTable(input: string): ImportCard[] {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex((line) =>
    /^\|\s*Type\s*\|\s*Front\s*\|\s*Back\s*\|\s*Extra\s*\|\s*Tags\s*\|\s*Source\s*\|$/i.test(line)
  );

  if (headerIndex === -1) {
    throw new Error("Anki table import expects header: `Type | Front | Back | Extra | Tags | Source`.");
  }

  const cards: ImportCard[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("|")) {
      continue;
    }
    if (/^\|\s*-+\s*\|/i.test(line)) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length < 6) {
      continue;
    }

    cards.push(...mapAnkiRowToCards({
      type: cells[0],
      front: cells[1],
      back: cells[2],
      extra: cells[3],
      tags: cells[4],
      source: cells[5]
    }));
  }

  return cards;
}

function splitMarkdownTableRow(row: string) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseAnkiTsv(input: string): ImportCard[] {
  const lines = input
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  const headerIndex = lines.findIndex((line) => /^Type\tFront\tBack\tExtra\tTags\tSource$/i.test(line.trim()));
  if (headerIndex === -1) {
    throw new Error("Anki TSV import expects header: `Type<TAB>Front<TAB>Back<TAB>Extra<TAB>Tags<TAB>Source`.");
  }

  const cards: ImportCard[] = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const cells = lines[index].split("\t");
    if (cells.length < 6) {
      continue;
    }

    cards.push(...mapAnkiRowToCards({
      type: cells[0],
      front: cells[1],
      back: cells[2],
      extra: cells[3],
      tags: cells[4],
      source: cells[5]
    }));
  }

  return cards;
}

function mapAnkiRowToCards(row: {
  type: string;
  front: string;
  back: string;
  extra: string;
  tags: string;
  source: string;
}): ImportCard[] {
  const normalizedType = row.type.trim().toLowerCase();
  const primary = buildRecallCard(row.front, row.back, row.extra, row.tags, row.source);

  if (normalizedType === "basic (and reversed)") {
    return [
      primary,
      buildRecallCard(row.back, row.front, row.extra, row.tags, row.source)
    ];
  }

  if (normalizedType === "cloze") {
    const clozeAnswer = extractClozeAnswer(row.front);
    return [
      buildRecallCard(stripCloze(row.front), clozeAnswer ? `${clozeAnswer}\n\n${appendExtra(row.back, row.extra)}` : appendExtra(row.back, row.extra), "", row.tags, row.source)
    ];
  }

  return [primary];
}

function buildRecallCard(front: string, back: string, extra: string, tags: string, source: string): ImportCard {
  return {
    front: front.trim(),
    back: appendExtra(back, extra),
    tags: parseTags(tags),
    source: source.trim() || undefined
  };
}

function appendExtra(back: string, extra: string) {
  const trimmedBack = back.trim();
  const trimmedExtra = extra.trim();
  if (!trimmedExtra) {
    return trimmedBack;
  }
  if (!trimmedBack) {
    return trimmedExtra;
  }
  return `${trimmedBack}\n\n${trimmedExtra}`;
}

function parseTags(raw: string) {
  return raw
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function stripCloze(front: string) {
  return front.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, "[...]").trim();
}

function extractClozeAnswer(front: string) {
  const matches = [...front.matchAll(/\{\{c\d+::(.*?)(::.*?)?\}\}/g)];
  if (matches.length === 0) {
    return "";
  }
  return matches.map((match) => match[1].trim()).join("; ");
}
