export type DeckSummary = {
  id: string
  name: string
  description: string
  dueCount: number
  totalCards: number
}

export type AppSnapshot = {
  dueToday: number
  completedToday: number
  pendingSync: number
  streak: number
  longestStreak: number
  lastSyncAt: string | null
  offlineReady: boolean
  decks: DeckSummary[]
}

export type SyncSettings = {
  apiUrl: string
  apiKey: string
}

export type SyncResult = {
  uploadedReviews: number
  deletedCards: number
  deletedDecks: number
  importedDecks: number
  importedCards: number
  syncedAt: string
}

export type RatingPreview = {
  rating: number
  label: string
  intervalLabel: string
}

export type ReviewCard = {
  id: string
  deckId: string
  deckName: string
  front: string
  back: string
  dueAt: string
  state: string
  reps: number
  lapses: number
  scheduledDays: number
  preview: RatingPreview[]
}

export type ReviewSession = {
  deckLabel: string
  cards: ReviewCard[]
}

export type CardSnapshot = {
  id: string
  deckId: string
  deckName: string
  front: string
  back: string
  dueAt: string
  state: string
  reps: number
  lapses: number
  scheduledDays: number
}

export type ReviewUpdate = {
  cardId: string
  logId: string
  previousCard: CardSnapshot
  nextCard: CardSnapshot
}

export type CardSummary = {
  id: string
  front: string
  back: string
  state: string
  dueAt: string
}
