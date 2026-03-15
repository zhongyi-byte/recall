import { Command } from "commander";

import { apiRequest } from "../lib/client.js";

export function createDecksCommand() {
  const command = new Command("decks").description("List or create decks");

  command.action(async () => {
    const payload = await apiRequest<{
      decks: Array<{ name: string; dueCount: number; totalCards: number; archived: boolean }>;
    }>("/api/decks");
    const decks = payload.decks;
    if (decks.length === 0) {
      console.log("No decks yet.");
      return;
    }

    for (const deck of decks) {
      console.log(`${deck.name}  due:${deck.dueCount}  total:${deck.totalCards}${deck.archived ? "  archived" : ""}`);
    }
  });

  command
    .command("create")
    .description("Create a new deck")
    .argument("<name>", "Deck name")
    .option("--desc <description>", "Deck description")
    .action(async (name, options) => {
      const payload = await apiRequest<{ deck?: { name?: string } }>("/api/decks", {
        method: "POST",
        body: {
          name,
          desc: options.desc ?? ""
        }
      });

      console.log(`Created deck ${payload.deck?.name ?? name}.`);
    });

  command
    .command("delete")
    .description("Delete a deck and all its cards")
    .argument("<deck>", "Deck name or id")
    .option("--yes", "Confirm deletion")
    .action(async (identifier, options) => {
      if (!options.yes) {
        throw new Error("Pass --yes to delete a deck.");
      }

      const payload = await apiRequest<{
        decks: Array<{ id: string; name: string }>;
      }>("/api/decks");

      const deck = payload.decks.find((item) => item.id === identifier)
        ?? payload.decks.find((item) => item.name.toLowerCase() === String(identifier).toLowerCase());

      if (!deck) {
        throw new Error(`Deck not found: ${identifier}`);
      }

      const deleted = await apiRequest<{ deckName: string; deletedCards: number }>(`/api/decks/${deck.id}`, {
        method: "DELETE"
      });

      console.log(`Deleted deck "${deleted.deckName}" and ${deleted.deletedCards} cards.`);
    });

  return command;
}
