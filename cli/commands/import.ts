import { Command } from "commander";

import { apiRequest } from "../lib/client.js";
import { readInput } from "../lib/input.js";
import { parseImportPayloadWithFormat } from "../lib/parsers.js";

const SUPPORTED_FORMATS = new Set(["auto", "qa", "json", "anki-table", "anki-tsv"]);

export function createImportCommand() {
  return new Command("import")
    .description("Import cards from Q/A markdown, JSON, Anki table/TSV, or stdin")
    .requiredOption("-d, --deck <name>", "Deck name")
    .option("-f, --file <path>", "Input file path")
    .option("--format <format>", "auto | qa | json | anki-table | anki-tsv", "auto")
    .action(async (options) => {
      const raw = await readInput(options.file);
      const format = String(options.format ?? "auto");
      if (!SUPPORTED_FORMATS.has(format)) {
        throw new Error(`Unsupported format: ${format}`);
      }

      const cards = parseImportPayloadWithFormat(
        raw,
        format as "auto" | "qa" | "json" | "anki-table" | "anki-tsv"
      );
      if (cards.length === 0) {
        throw new Error("No cards parsed from input.");
      }

      const payload = await apiRequest<{ count: number }>("/api/cards/bulk", {
        method: "POST",
        body: {
          deckName: options.deck,
          cards
        }
      });

      console.log(`Imported ${payload.count} cards into "${options.deck}".`);
    });
}

export function createImportAnkiCommand() {
  return new Command("import-anki")
    .description("Import Anki-style markdown table or TSV into Recall")
    .requiredOption("-d, --deck <name>", "Deck name")
    .option("-f, --file <path>", "Input file path")
    .option("--format <format>", "anki-table | anki-tsv", "anki-table")
    .action(async (options) => {
      const raw = await readInput(options.file);
      const format = String(options.format ?? "anki-table");
      if (format !== "anki-table" && format !== "anki-tsv") {
        throw new Error(`Unsupported Anki format: ${format}`);
      }

      const cards = parseImportPayloadWithFormat(raw, format);
      if (cards.length === 0) {
        throw new Error("No cards parsed from input.");
      }

      const payload = await apiRequest<{ count: number }>("/api/cards/bulk", {
        method: "POST",
        body: {
          deckName: options.deck,
          cards
        }
      });

      console.log(`Imported ${payload.count} Anki-style cards into "${options.deck}".`);
    });
}
