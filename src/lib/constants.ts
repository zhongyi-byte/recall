import { Rating, State } from "ts-fsrs";

export const AUTH_COOKIE_NAME = "recall_api_key";

export const REVIEW_RATINGS = [
  { value: Rating.Again, label: "Again", tone: "text-rose-700", key: "again" },
  { value: Rating.Hard, label: "Hard", tone: "text-amber-700", key: "hard" },
  { value: Rating.Good, label: "Good", tone: "text-sky-700", key: "good" },
  { value: Rating.Easy, label: "Easy", tone: "text-emerald-700", key: "easy" }
] as const;

export const STATE_LABELS: Record<number, string> = {
  [State.New]: "New",
  [State.Learning]: "Learning",
  [State.Review]: "Review",
  [State.Relearning]: "Relearning"
};
