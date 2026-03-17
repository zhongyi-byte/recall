import { type Grade, Rating, State } from "ts-fsrs";

import {
  type SerializedCardState,
  applyGrade,
  createInitialState,
  deserializeCard,
  previewRatingIntervals,
  serializeCard
} from "@/lib/fsrs";
import { STATE_LABELS } from "@/lib/constants";

export type DeckSummary = {
  id: string;
  name: string;
  desc: string;
  archived: boolean;
  dueCount: number;
  totalCards: number;
};

export type CardListItem = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  state: string;
  due: string;
};

export type DueReviewCard = {
  id: string;
  deckId: string;
  deckName: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
  state: string;
  due: string;
  preview: Record<number, { label: string; minutesLabel: string; due: string }>;
};

export type DashboardStats = {
  dueToday: number;
  completedToday: number;
  totalCards: number;
  streak: number;
  longestStreak: number;
  retention: number;
  weeklyActivity: Array<{ date: string; count: number }>;
  heatmap: Array<{ date: string; count: number }>;
  stateDistribution: Array<{ state: string; count: number }>;
  masteryByDeck: Array<{ deckId: string; deckName: string; mastered: number; total: number }>;
};

export type ReviewMutation = {
  cardId: string;
  logId: string;
  previousState: SerializedCardState;
  nextState: SerializedCardState;
  preview: Record<number, { label: string; minutesLabel: string; due: string }>;
};

export type SyncDeck = {
  id: string;
  name: string;
  desc: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SyncCard = {
  id: string;
  deckId: string;
  front: string;
  back: string;
  source: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  lastElapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
};

type Queryable = Pick<D1Database, "prepare" | "batch">;

type CardRow = {
  id: string;
  deck_id: string;
  deck_name: string;
  front: string;
  back: string;
  source: string;
  tags: string;
  created_at: string;
  updated_at: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function deckSummary(row: {
  id: string;
  name: string;
  desc: string;
  archived: number;
  due_count: number | string | null;
  total_cards: number | string | null;
}): DeckSummary {
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    archived: Boolean(row.archived),
    dueCount: Number(row.due_count ?? 0),
    totalCards: Number(row.total_cards ?? 0)
  };
}

function toCardListItem(row: CardRow): CardListItem {
  return {
    id: row.id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    source: row.source,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: STATE_LABELS[row.state] ?? "Unknown",
    due: row.due
  };
}

function toFsrsState(row: CardRow): SerializedCardState {
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    last_elapsed_days: row.last_elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review
  };
}

function toDueReviewCard(row: CardRow): DueReviewCard {
  const fsrsCard = deserializeCard(toFsrsState(row));
  return {
    id: row.id,
    deckId: row.deck_id,
    deckName: row.deck_name,
    front: row.front,
    back: row.back,
    source: row.source,
    tags: parseTags(row.tags),
    state: STATE_LABELS[row.state] ?? "Unknown",
    due: row.due,
    preview: previewRatingIntervals(fsrsCard)
  };
}

export async function listDecks(db: Queryable) {
  const result = await db
    .prepare(
      `SELECT
         d.id,
         d.name,
         d.desc,
         d.archived,
         COUNT(c.id) AS total_cards,
         SUM(CASE
           WHEN cs.due IS NOT NULL AND datetime(cs.due) <= datetime('now') AND d.archived = 0 THEN 1
           ELSE 0
         END) AS due_count
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       LEFT JOIN card_states cs ON cs.card_id = c.id
       GROUP BY d.id
       ORDER BY d.archived ASC, due_count DESC, d.updated_at DESC`
    )
    .all();

  return (result.results ?? []).map((row) => deckSummary(row as never));
}

export async function getDeck(db: Queryable, deckId: string) {
  const row = await db
    .prepare(
      `SELECT
         d.id,
         d.name,
         d.desc,
         d.archived,
         COUNT(c.id) AS total_cards,
         SUM(CASE
           WHEN cs.due IS NOT NULL AND datetime(cs.due) <= datetime('now') AND d.archived = 0 THEN 1
           ELSE 0
         END) AS due_count
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       LEFT JOIN card_states cs ON cs.card_id = c.id
       WHERE d.id = ?
       GROUP BY d.id`
    )
    .bind(deckId)
    .first();

  return row ? deckSummary(row as never) : null;
}

export async function findDeckByName(db: Queryable, name: string) {
  const row = await db
    .prepare(
      `SELECT
         d.id,
         d.name,
         d.desc,
         d.archived,
         COUNT(c.id) AS total_cards,
         SUM(CASE
           WHEN cs.due IS NOT NULL AND datetime(cs.due) <= datetime('now') AND d.archived = 0 THEN 1
           ELSE 0
         END) AS due_count
       FROM decks d
       LEFT JOIN cards c ON c.deck_id = d.id
       LEFT JOIN card_states cs ON cs.card_id = c.id
       WHERE lower(d.name) = lower(?)
       GROUP BY d.id
       LIMIT 1`
    )
    .bind(name.trim())
    .first();

  return row ? deckSummary(row as never) : null;
}

export async function createDeck(db: Queryable, input: { name: string; desc?: string }) {
  const id = createId();
  const timestamp = nowIso();

  await db
    .prepare(
      `INSERT INTO decks (id, name, desc, archived, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .bind(id, input.name.trim(), input.desc?.trim() ?? "", timestamp, timestamp)
    .run();

  return getDeck(db, id);
}

export async function setDeckArchived(db: Queryable, deckId: string, archived: boolean) {
  await db
    .prepare(`UPDATE decks SET archived = ?, updated_at = ? WHERE id = ?`)
    .bind(archived ? 1 : 0, nowIso(), deckId)
    .run();

  return getDeck(db, deckId);
}

export async function findOrCreateDeckByName(db: Queryable, name: string) {
  const existing = await db
    .prepare(`SELECT id FROM decks WHERE lower(name) = lower(?) LIMIT 1`)
    .bind(name.trim())
    .first<{ id: string }>();

  if (existing?.id) {
    return existing.id;
  }

  const deck = await createDeck(db, { name });
  if (!deck) {
    throw new Error("Failed to create deck");
  }

  return deck.id;
}

export async function listCardsByDeck(db: Queryable, deckId: string) {
  const result = await db
    .prepare(
      `SELECT
         c.id,
         c.deck_id,
         d.name AS deck_name,
         c.front,
         c.back,
         c.source,
         c.tags,
         c.created_at,
         c.updated_at,
         cs.due,
         cs.stability,
         cs.difficulty,
         cs.elapsed_days,
         cs.last_elapsed_days,
         cs.scheduled_days,
         cs.learning_steps,
         cs.reps,
         cs.lapses,
         cs.state,
         cs.last_review
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       INNER JOIN card_states cs ON cs.card_id = c.id
       WHERE c.deck_id = ?
       ORDER BY c.created_at DESC`
    )
    .bind(deckId)
    .all<CardRow>();

  return (result.results ?? []).map(toCardListItem);
}

export async function exportSyncSnapshot(db: Queryable): Promise<{ decks: SyncDeck[]; cards: SyncCard[] }> {
  const [deckResult, cardResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, desc, archived, created_at, updated_at
         FROM decks
         ORDER BY updated_at DESC`
      )
      .all<{
        id: string;
        name: string;
        desc: string;
        archived: number;
        created_at: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT
           c.id,
           c.deck_id,
           c.front,
           c.back,
           c.source,
           c.tags,
           c.created_at,
           c.updated_at,
           cs.due,
           cs.stability,
           cs.difficulty,
           cs.elapsed_days,
           cs.last_elapsed_days,
           cs.scheduled_days,
           cs.learning_steps,
           cs.reps,
           cs.lapses,
           cs.state,
           cs.last_review
         FROM cards c
         INNER JOIN card_states cs ON cs.card_id = c.id
         ORDER BY c.updated_at DESC`
      )
      .all<CardRow>()
  ]);

  return {
    decks: (deckResult.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      desc: row.desc,
      archived: Boolean(row.archived),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    cards: (cardResult.results ?? []).map((row) => ({
      id: row.id,
      deckId: row.deck_id,
      front: row.front,
      back: row.back,
      source: row.source,
      tags: parseTags(row.tags),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      due: row.due,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsed_days,
      lastElapsedDays: row.last_elapsed_days,
      scheduledDays: row.scheduled_days,
      learningSteps: row.learning_steps,
      reps: row.reps,
      lapses: row.lapses,
      state: row.state,
      lastReview: row.last_review
    }))
  };
}

export async function createCard(
  db: Queryable,
  input: {
    deckId?: string;
    deckName?: string;
    front: string;
    back: string;
    source?: string;
    tags?: string[];
  }
) {
  const deckId = input.deckId ?? (input.deckName ? await findOrCreateDeckByName(db, input.deckName) : null);
  if (!deckId) {
    throw new Error("Deck is required");
  }

  const cardId = createId();
  const timestamp = nowIso();
  const initialState = createInitialState(new Date());

  await db.batch([
    db
      .prepare(
        `INSERT INTO cards (id, deck_id, front, back, source, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        cardId,
        deckId,
        input.front.trim(),
        input.back.trim(),
        input.source?.trim() ?? "",
        JSON.stringify(input.tags ?? []),
        timestamp,
        timestamp
      ),
    db
      .prepare(
        `INSERT INTO card_states (
           card_id, due, stability, difficulty, elapsed_days, last_elapsed_days,
           scheduled_days, learning_steps, reps, lapses, state, last_review
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        cardId,
        initialState.due,
        initialState.stability,
        initialState.difficulty,
        initialState.elapsed_days,
        initialState.last_elapsed_days,
        initialState.scheduled_days,
        initialState.learning_steps,
        initialState.reps,
        initialState.lapses,
        initialState.state,
        initialState.last_review
      )
  ]);

  return cardId;
}

export async function bulkCreateCards(
  db: Queryable,
  input: {
    deckId?: string;
    deckName?: string;
    cards: Array<{ front: string; back: string; source?: string; tags?: string[] }>;
  }
) {
  const ids: string[] = [];
  for (const card of input.cards) {
    ids.push(
      await createCard(db, {
        deckId: input.deckId,
        deckName: input.deckName,
        front: card.front,
        back: card.back,
        source: card.source,
        tags: card.tags
      })
    );
  }
  return ids;
}

export async function listDueCards(db: Queryable, deckId?: string) {
  const baseQuery = `SELECT
      c.id,
      c.deck_id,
      d.name AS deck_name,
      c.front,
      c.back,
      c.source,
      c.tags,
      c.created_at,
      c.updated_at,
      cs.due,
      cs.stability,
      cs.difficulty,
      cs.elapsed_days,
      cs.last_elapsed_days,
      cs.scheduled_days,
      cs.learning_steps,
      cs.reps,
      cs.lapses,
      cs.state,
      cs.last_review
    FROM cards c
    INNER JOIN decks d ON d.id = c.deck_id
    INNER JOIN card_states cs ON cs.card_id = c.id
    WHERE d.archived = 0
      AND datetime(cs.due) <= datetime('now')
      ${deckId ? "AND c.deck_id = ?" : ""}
    ORDER BY datetime(cs.due) ASC
    LIMIT 200`;

  const statement = db.prepare(baseQuery);
  const result = deckId ? await statement.bind(deckId).all<CardRow>() : await statement.all<CardRow>();
  return (result.results ?? []).map(toDueReviewCard);
}

export async function getReviewCard(db: Queryable, cardId: string) {
  const row = await db
    .prepare(
      `SELECT
         c.id,
         c.deck_id,
         d.name AS deck_name,
         c.front,
         c.back,
         c.source,
         c.tags,
         c.created_at,
         c.updated_at,
         cs.due,
         cs.stability,
         cs.difficulty,
         cs.elapsed_days,
         cs.last_elapsed_days,
         cs.scheduled_days,
         cs.learning_steps,
         cs.reps,
         cs.lapses,
         cs.state,
         cs.last_review
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       INNER JOIN card_states cs ON cs.card_id = c.id
       WHERE c.id = ?
       LIMIT 1`
    )
    .bind(cardId)
    .first<CardRow>();

  return row ?? null;
}

export async function deleteCard(db: Queryable, cardId: string) {
  const card = await getReviewCard(db, cardId);
  if (!card) {
    return null;
  }

  await db.batch([
    db.prepare(`DELETE FROM review_logs WHERE card_id = ?`).bind(cardId),
    db.prepare(`DELETE FROM card_states WHERE card_id = ?`).bind(cardId),
    db.prepare(`DELETE FROM cards WHERE id = ?`).bind(cardId),
    db.prepare(`UPDATE decks SET updated_at = ? WHERE id = ?`).bind(nowIso(), card.deck_id)
  ]);

  return {
    cardId,
    deckId: card.deck_id,
    deckName: card.deck_name,
    front: card.front
  };
}

export async function deleteDeck(db: Queryable, deckId: string) {
  const deck = await getDeck(db, deckId);
  if (!deck) {
    return null;
  }

  const cardIdsResult = await db
    .prepare(`SELECT id FROM cards WHERE deck_id = ?`)
    .bind(deckId)
    .all<{ id: string }>();
  const cardIds = (cardIdsResult.results ?? []).map((row) => row.id);

  const statements = [];

  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => "?").join(", ");
    statements.push(
      db.prepare(`DELETE FROM review_logs WHERE card_id IN (${placeholders})`).bind(...cardIds),
      db.prepare(`DELETE FROM card_states WHERE card_id IN (${placeholders})`).bind(...cardIds)
    );
  }

  statements.push(
    db.prepare(`DELETE FROM cards WHERE deck_id = ?`).bind(deckId),
    db.prepare(`DELETE FROM decks WHERE id = ?`).bind(deckId)
  );

  await db.batch(statements);

  return {
    deckId,
    deckName: deck.name,
    deletedCards: cardIds.length
  };
}

export async function submitReview(db: Queryable, cardId: string, rating: Grade) {
  const row = await getReviewCard(db, cardId);
  if (!row) {
    throw new Error("Card not found");
  }

  const previousState = toFsrsState(row);
  const fsrsCard = deserializeCard(previousState);
  const reviewed = applyGrade(fsrsCard, rating);
  const nextState = serializeCard(reviewed.card);
  const logId = createId();
  const reviewedAt = nowIso();

  await db.batch([
    db
      .prepare(
        `UPDATE card_states
         SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, last_elapsed_days = ?,
             scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?, state = ?, last_review = ?
         WHERE card_id = ?`
      )
      .bind(
        nextState.due,
        nextState.stability,
        nextState.difficulty,
        nextState.elapsed_days,
        reviewed.log.last_elapsed_days,
        nextState.scheduled_days,
        nextState.learning_steps,
        nextState.reps,
        nextState.lapses,
        nextState.state,
        nextState.last_review,
        cardId
      ),
    db
      .prepare(
        `INSERT INTO review_logs (
           id, card_id, rating, state, due, stability, difficulty, elapsed_days,
           last_elapsed_days, scheduled_days, learning_steps, reviewed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        logId,
        cardId,
        Number(reviewed.log.rating),
        Number(reviewed.log.state),
        reviewed.log.due.toISOString(),
        reviewed.log.stability,
        reviewed.log.difficulty,
        reviewed.log.elapsed_days,
        reviewed.log.last_elapsed_days,
        reviewed.log.scheduled_days,
        reviewed.log.learning_steps,
        reviewedAt
      )
  ]);

  return {
    cardId,
    logId,
    previousState,
    nextState,
    preview: previewRatingIntervals(reviewed.card)
  } satisfies ReviewMutation;
}

export async function undoReview(
  db: Queryable,
  input: { cardId: string; logId: string; previousState: SerializedCardState }
) {
  await db.batch([
    db
      .prepare(
        `UPDATE card_states
         SET due = ?, stability = ?, difficulty = ?, elapsed_days = ?, last_elapsed_days = ?,
             scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?, state = ?, last_review = ?
         WHERE card_id = ?`
      )
      .bind(
        input.previousState.due,
        input.previousState.stability,
        input.previousState.difficulty,
        input.previousState.elapsed_days,
        input.previousState.last_elapsed_days,
        input.previousState.scheduled_days,
        input.previousState.learning_steps,
        input.previousState.reps,
        input.previousState.lapses,
        input.previousState.state,
        input.previousState.last_review,
        input.cardId
      ),
    db.prepare(`DELETE FROM review_logs WHERE id = ? AND card_id = ?`).bind(input.logId, input.cardId)
  ]);
}

async function fetchReviewDayCounts(db: Queryable, days: number) {
  const result = await db
    .prepare(
      `SELECT substr(reviewed_at, 1, 10) AS date, COUNT(*) AS count
       FROM review_logs
       WHERE reviewed_at >= datetime('now', ?)
       GROUP BY substr(reviewed_at, 1, 10)
       ORDER BY date ASC`
    )
    .bind(`-${days - 1} days`)
    .all<{ date: string; count: number }>();

  return (result.results ?? []).map((row) => ({
    date: row.date,
    count: Number(row.count)
  }));
}

function computeStreaks(days: string[]) {
  if (days.length === 0) {
    return { streak: 0, longestStreak: 0 };
  }

  const sorted = [...days].sort();
  let longestStreak = 1;
  let current = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(`${sorted[index - 1]}T00:00:00.000Z`);
    const currentDate = new Date(`${sorted[index]}T00:00:00.000Z`);
    const diffDays = Math.round((currentDate.getTime() - previous.getTime()) / 86400000);
    if (diffDays === 1) {
      current += 1;
      longestStreak = Math.max(longestStreak, current);
    } else {
      current = 1;
    }
  }

  const daySet = new Set(sorted);
  let streak = 0;
  let cursor = new Date();
  const today = cursor.toISOString().slice(0, 10);
  if (!daySet.has(today)) {
    cursor = new Date(cursor.getTime() - 86400000);
  }

  for (;;) {
    const iso = cursor.toISOString().slice(0, 10);
    if (!daySet.has(iso)) {
      break;
    }
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }

  return { streak, longestStreak };
}

export async function getDashboardStats(db: Queryable): Promise<DashboardStats> {
  const [dueRow, totalCardsRow, completedRow, retentionRow, stateDistributionRow, masteryRow, weeklyActivity, heatmap, reviewDays] =
    await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM card_states cs
           INNER JOIN cards c ON c.id = cs.card_id
           INNER JOIN decks d ON d.id = c.deck_id
           WHERE d.archived = 0 AND datetime(cs.due) <= datetime('now')`
        )
        .first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) AS count FROM cards`).first<{ count: number }>(),
      db
        .prepare(`SELECT COUNT(*) AS count FROM review_logs WHERE substr(reviewed_at, 1, 10) = substr(datetime('now'), 1, 10)`)
        .first<{ count: number }>(),
      db
        .prepare(
          `SELECT
             SUM(CASE WHEN rating IN (?, ?) THEN 1 ELSE 0 END) AS retained,
             COUNT(*) AS total
           FROM review_logs`
        )
        .bind(Number(Rating.Good), Number(Rating.Easy))
        .first<{ retained: number; total: number }>(),
      db
        .prepare(
          `SELECT state, COUNT(*) AS count
           FROM card_states
           GROUP BY state
           ORDER BY state ASC`
        )
        .all<{ state: number; count: number }>(),
      db
        .prepare(
          `SELECT
             d.id AS deck_id,
             d.name AS deck_name,
             SUM(CASE WHEN cs.state = ? THEN 1 ELSE 0 END) AS mastered,
             COUNT(cs.card_id) AS total
           FROM decks d
           LEFT JOIN cards c ON c.deck_id = d.id
           LEFT JOIN card_states cs ON cs.card_id = c.id
           GROUP BY d.id
           ORDER BY mastered DESC, total DESC`
        )
        .bind(Number(State.Review))
        .all<{ deck_id: string; deck_name: string; mastered: number; total: number }>(),
      fetchReviewDayCounts(db, 7),
      fetchReviewDayCounts(db, 90),
      db
        .prepare(`SELECT DISTINCT substr(reviewed_at, 1, 10) AS date FROM review_logs ORDER BY date ASC`)
        .all<{ date: string }>()
    ]);

  const streaks = computeStreaks((reviewDays.results ?? []).map((row) => row.date));
  const retained = Number(retentionRow?.retained ?? 0);
  const totalReviews = Number(retentionRow?.total ?? 0);

  return {
    dueToday: Number(dueRow?.count ?? 0),
    completedToday: Number(completedRow?.count ?? 0),
    totalCards: Number(totalCardsRow?.count ?? 0),
    streak: streaks.streak,
    longestStreak: streaks.longestStreak,
    retention: totalReviews === 0 ? 0 : Math.round((retained / totalReviews) * 100),
    weeklyActivity,
    heatmap,
    stateDistribution: (stateDistributionRow.results ?? []).map((row) => ({
      state: STATE_LABELS[row.state] ?? `State ${row.state}`,
      count: Number(row.count)
    })),
    masteryByDeck: (masteryRow.results ?? []).map((row) => ({
      deckId: row.deck_id,
      deckName: row.deck_name,
      mastered: Number(row.mastered ?? 0),
      total: Number(row.total ?? 0)
    }))
  };
}
