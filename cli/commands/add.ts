import { Command } from "commander";

import { apiRequest } from "../lib/client.js";

export function createAddCommand() {
  return new Command("add")
    .description("Add a single card")
    .requiredOption("-d, --deck <name>", "Deck name")
    .requiredOption("-f, --front <front>", "Card front")
    .requiredOption("-b, --back <back>", "Card back")
    .option("--tags <tags>", "Comma separated tags")
    .option("--source <source>", "Source label")
    .action(async (options) => {
      const tags = typeof options.tags === "string"
        ? options.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
        : [];

      const payload = await apiRequest<{ cardId: string }>("/api/cards", {
        method: "POST",
        body: {
          deckName: options.deck,
          front: options.front,
          back: options.back,
          source: options.source,
          tags
        }
      });

      console.log(`Created card ${payload.cardId} in "${options.deck}".`);
    });
}
