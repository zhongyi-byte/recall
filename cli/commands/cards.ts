import { Command } from "commander";

import { apiRequest } from "../lib/client.js";

type DeckSummary = {
  id: string;
  name: string;
  dueCount: number;
  totalCards: number;
  archived: boolean;
};

type CardListItem = {
  id: string;
  front: string;
  state: string;
  due: string;
};

function summarizeFront(front: string) {
  const singleLine = front.replace(/\s+/g, " ").trim();
  return singleLine.length > 72 ? `${singleLine.slice(0, 69)}...` : singleLine;
}

async function resolveDeckId(identifier: string) {
  const payload = await apiRequest<{ decks: DeckSummary[] }>("/api/decks");
  const match = payload.decks.find((deck) => deck.id === identifier)
    ?? payload.decks.find((deck) => deck.name.toLowerCase() === identifier.toLowerCase());

  if (!match) {
    throw new Error(`Deck not found: ${identifier}`);
  }

  return match;
}

export function createCardsCommand() {
  const command = new Command("cards").description("List or delete cards");

  command
    .option("-d, --deck <deck>", "Deck name or id")
    .option("--limit <count>", "Maximum cards to show", "20")
    .action(async (options) => {
      if (!options.deck) {
        throw new Error("Pass --deck <name-or-id> to list cards.");
      }

      const deck = await resolveDeckId(String(options.deck));
      const payload = await apiRequest<{ cards: CardListItem[] }>(`/api/decks/${deck.id}`);
      const limit = Math.max(1, Number.parseInt(String(options.limit), 10) || 20);
      const cards = payload.cards.slice(0, limit);

      if (cards.length === 0) {
        console.log(`No cards in "${deck.name}".`);
        return;
      }

      for (const card of cards) {
        console.log(`${card.id}  ${card.state}  ${summarizeFront(card.front)}`);
      }

      if (payload.cards.length > cards.length) {
        console.log(`Showing ${cards.length}/${payload.cards.length} cards from "${deck.name}".`);
      }
    });

  command
    .command("delete")
    .description("Delete one or more cards by id")
    .argument("<card-id...>", "Card ids to delete")
    .option("--yes", "Confirm deletion")
    .action(async (cardIds: string[], options) => {
      if (!options.yes) {
        throw new Error("Pass --yes to delete cards.");
      }

      for (const cardId of cardIds) {
        const payload = await apiRequest<{ cardId: string; deckName: string; front: string }>(`/api/cards/${cardId}`, {
          method: "DELETE"
        });
        console.log(`Deleted ${payload.cardId} from "${payload.deckName}": ${summarizeFront(payload.front)}`);
      }
    });

  return command;
}
