import {
  type Card,
  type Grade,
  type RecordLogItem,
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State
} from "ts-fsrs";

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 36500,
    enable_fuzz: false
  })
);

export type SerializedCardState = {
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

export type ReviewPreview = {
  label: string;
  minutesLabel: string;
  due: string;
};

export function createInitialState(now = new Date()): SerializedCardState {
  return serializeCard(createEmptyCard(now));
}

export function serializeCard(card: Card): SerializedCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    last_elapsed_days: 0,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: Number(card.state),
    last_review: card.last_review ? card.last_review.toISOString() : null
  };
}

export function deserializeCard(state: SerializedCardState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.last_review ? new Date(state.last_review) : undefined
  };
}

export function previewRatingIntervals(card: Card, now = new Date()) {
  const preview = scheduler.repeat(card, now);

  return {
    [Rating.Again]: mapPreview("Again", preview[Rating.Again].card.due, now),
    [Rating.Hard]: mapPreview("Hard", preview[Rating.Hard].card.due, now),
    [Rating.Good]: mapPreview("Good", preview[Rating.Good].card.due, now),
    [Rating.Easy]: mapPreview("Easy", preview[Rating.Easy].card.due, now)
  };
}

export function applyGrade(card: Card, rating: Grade, now = new Date()): RecordLogItem {
  return scheduler.next(card, now, rating);
}

function mapPreview(label: string, due: Date, now: Date): ReviewPreview {
  return {
    label,
    minutesLabel: formatInterval(now, due),
    due: due.toISOString()
  };
}

export function formatInterval(now: Date, due: Date) {
  const deltaMs = due.getTime() - now.getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60000));

  if (minutes < 60) {
    return pluralize(minutes, "min");
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return pluralize(hours, "hour");
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return pluralize(days, "day");
  }

  const months = Math.round(days / 30);
  if (months < 12) {
    return pluralize(months, "month");
  }

  return pluralize(Math.round(months / 12), "year");
}

function pluralize(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}
