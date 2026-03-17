import { invoke } from '@tauri-apps/api/core'

import type {
  AppSnapshot,
  CardSnapshot,
  CardSummary,
  ReviewSession,
  ReviewUpdate,
  SyncResult,
  SyncSettings,
} from '../types'

const mockSnapshot: AppSnapshot = {
  dueToday: 5,
  completedToday: 0,
  pendingSync: 0,
  streak: 0,
  longestStreak: 0,
  lastSyncAt: null,
  offlineReady: true,
  decks: [
    {
      id: 'ai-insights',
      name: 'AI Insights',
      description: 'Mock data for browser preview.',
      dueCount: 2,
      totalCards: 2,
    },
    {
      id: 'investing',
      name: 'Investing',
      description: 'Mock data for browser preview.',
      dueCount: 2,
      totalCards: 2,
    },
  ],
}

const mockReview: ReviewSession = {
  deckLabel: 'All Decks',
  cards: [
    {
      id: 'mock-1',
      deckId: 'ai-insights',
      deckName: 'AI Insights',
      front: 'Why should desktop review stay local-first?',
      back: '**Flip and score** should never wait on network round trips.',
      dueAt: new Date().toISOString(),
      state: 'New',
      reps: 0,
      lapses: 0,
      scheduledDays: 0,
      preview: [
        { rating: 1, label: 'Again', intervalLabel: '1 min' },
        { rating: 2, label: 'Hard', intervalLabel: '10 mins' },
        { rating: 3, label: 'Good', intervalLabel: '1 day' },
        { rating: 4, label: 'Easy', intervalLabel: '3 days' },
      ],
    },
  ],
}

function isDesktop() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isDesktopRuntime() {
  return isDesktop()
}

export async function loadSnapshot() {
  if (!isDesktop()) return mockSnapshot
  return invoke<AppSnapshot>('load_snapshot')
}

export async function getSyncSettings() {
  if (!isDesktop()) {
    return {
      apiUrl: 'https://recall.zhong4092.workers.dev',
      apiKey: '',
    } satisfies SyncSettings
  }
  return invoke<SyncSettings>('get_sync_settings')
}

export async function saveSyncSettings(apiUrl: string, apiKey: string) {
  if (!isDesktop()) {
    return { apiUrl, apiKey } satisfies SyncSettings
  }
  return invoke<SyncSettings>('save_sync_settings', { apiUrl, apiKey })
}

export async function syncNow() {
  if (!isDesktop()) {
    return {
      uploadedReviews: 0,
      deletedCards: 0,
      deletedDecks: 0,
      importedDecks: mockSnapshot.decks.length,
      importedCards: 0,
      syncedAt: new Date().toISOString(),
    } satisfies SyncResult
  }
  return invoke<SyncResult>('sync_now')
}

export async function startReview(deckId?: string) {
  if (!isDesktop()) return mockReview
  return invoke<ReviewSession>('start_review', { deckId })
}

export async function submitReview(cardId: string, rating: number) {
  if (!isDesktop()) {
    const previousCard = mockReview.cards[0]
    return {
      cardId,
      logId: 'mock-log',
      previousCard,
      nextCard: {
        ...previousCard,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        state: 'Review',
        reps: 1,
        scheduledDays: 1,
      },
    } satisfies ReviewUpdate
  }

  return invoke<ReviewUpdate>('submit_review', { cardId, rating })
}

export async function undoReview(card: CardSnapshot, logId: string) {
  if (!isDesktop()) return
  return invoke<void>('undo_review', { card, logId })
}

export async function listCards(deckId: string) {
  if (!isDesktop()) return []
  return invoke<CardSummary[]>('list_cards', { deckId })
}

export async function deleteCard(cardId: string) {
  if (!isDesktop()) return
  return invoke('delete_card', { cardId })
}

export async function deleteDeck(deckId: string) {
  if (!isDesktop()) return
  return invoke('delete_deck', { deckId })
}
