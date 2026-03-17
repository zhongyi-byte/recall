import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import ReactMarkdown from 'react-markdown'
import { getCurrentWindow } from '@tauri-apps/api/window'

import './App.css'
import {
  deleteCard,
  deleteDeck,
  getSyncSettings,
  isDesktopRuntime,
  listCards,
  loadSnapshot,
  saveSyncSettings,
  syncNow,
  startReview,
  submitReview,
  undoReview,
} from './lib/desktop'
import type {
  AppSnapshot,
  CardSummary,
  DeckSummary,
  ReviewSession,
  ReviewUpdate,
  SyncResult,
  SyncSettings,
} from './types'

type View = 'today' | 'review' | 'decks' | 'settings'
type Language = 'zh' | 'en'
type SyncStage = 'idle' | 'saving' | 'syncing'

type UndoState = {
  previousCard: ReviewUpdate['previousCard']
  logId: string
}

const navItems: Array<{ id: View; label: string }> = [
  { id: 'today', label: '今日 Today' },
  { id: 'review', label: '复习 Review' },
  { id: 'decks', label: '牌组 Decks' },
  { id: 'settings', label: '设置 Settings' },
]

const copy = {
  zh: {
    nav: { today: '今日', review: '复习', decks: '牌组', settings: '设置' },
    localFirst: '本地优先记忆系统',
    todayLabel: '今日',
    status: '状态',
    loading: '正在加载本地数据...',
    checking: '正在检查本地状态...',
    noSync: '同步状态尚未加载',
    completedToday: (count: number) => `今日已完成 ${count} 张`,
    pendingSync: (count: number) => `待同步 ${count} 条`,
    topTitle: '复习优先桌面客户端',
    refresh: '刷新',
    startReview: '开始复习',
    focus: '重点',
    dueNow: (count: number) => `现在有 ${count} 张待复习卡片`,
    heroBody: '翻卡和评分都留在本地，云同步退到后台，这样复习才像真正的桌面应用。',
    reviewAll: '复习全部到期卡片',
    browseDecks: '查看牌组',
    completed: '已完成',
    streak: '连续天数',
    longest: '最长纪录',
    pending: '待同步',
    days: '天',
    decks: '牌组',
    chooseLane: '选择一个复习入口',
    reviewSession: '复习会话',
    dueCount: (count: number) => `当前待复习 ${count} 张`,
    revealHint: '点击或按 Space 显示答案',
    scoreHint: '选择评分进入下一张',
    emptyReviewTitle: '没有待复习卡片了',
    emptyReviewBody: '这轮复习已经完成，下一批卡片准备好后会继续接上。',
    shortcuts: '快捷键',
    shortcutReveal: 'Space 显示答案',
    shortcutRate: '1 / 2 / 3 / 4 评分',
    shortcutUndo: 'Undo 撤销上一张评分',
    sessionControl: '会话控制',
    reveal: '显示答案',
    undo: '撤销上一张',
    deleteCurrent: '删除这张卡',
    reload: '重新载入会话',
    localLibrary: '本地卡片库',
    cardsAndDue: (total: number, due: number) => `${total} 张卡片 · ${due} 张待复习`,
    selectedDeck: '当前牌组',
    reviewDeck: '复习这个牌组',
    deleteDeck: '删除牌组',
    nextDue: (state: string, due: string) => `${state} · 下次出现 ${due}`,
    delete: '删除',
    noCardsTitle: '这个牌组里还没有卡片',
    noCardsBody: '可以先用 CLI 或网页端导入，再在这里复习。',
    selectDeckTitle: '先选择一个牌组',
    selectDeckBody: '这里可以看卡片、删卡、删整个牌组。',
    settings: '设置',
    settingsTitle: '应用设置',
    settingsBody: '语言、同步和本地优先的行为都放在这里，首页保持专注。',
    language: '界面语言',
    languageHelp: '只切换界面文案，不改动卡片本身内容。',
    syncTitle: 'Cloudflare 同步',
    syncBody: '手动同步会先上传本地评分和删除操作，再拉取云端最新 deck / card 快照。',
    syncUrl: 'API 地址',
    syncKey: 'API Key',
    syncSave: '保存配置',
    syncNow: '立即同步',
    syncExit: '如果有待同步事件，应用会每 5 分钟自动同步一次；退出应用前也会再同步一次。',
    syncAuto: '自动同步',
    syncAutoBody: '仅在本地有删除、复习进展等待上传变更时触发，避免空跑。',
    syncReady: '同步配置已保存。',
    syncStarted: '同步已开始，正在和 Cloudflare 交换数据...',
    syncSaving: '正在保存同步配置...',
    syncRunning: '正在同步中',
    syncDone: (result: SyncResult) =>
      `同步完成：上传 ${result.uploadedReviews} 条复习，删除 ${result.deletedCards} 张卡片 / ${result.deletedDecks} 个牌组，拉取 ${result.importedDecks} 个牌组和 ${result.importedCards} 张卡片。`,
    pendingEvents: '待同步事件',
    pendingEventsBody: '这些是本地已经完成、但还没推到云端的变更。',
    lastSync: '上次同步',
    never: '从未',
    lastSyncBody: '首次同步后，这里会显示最近一次成功时间。',
    mode: '模式',
    offlineReady: '可离线复习',
    modeChecking: '检查中',
    modeBody: '翻卡和评分不依赖网络，同步只是后台补写。',
    deletedCard: '卡片已移入回收站，并从当前复习队列移除。',
    deletedDeck: '牌组已删除',
    loadLocalError: '加载本地数据失败',
    loadCardsError: '加载卡片失败',
    startReviewError: '启动复习失败',
    scoreError: '评分失败',
    undoError: '撤销失败',
    deleteCardError: '删除卡片失败',
    deleteDeckError: '删除牌组失败',
  },
  en: {
    nav: { today: 'Today', review: 'Review', decks: 'Decks', settings: 'Settings' },
    localFirst: 'Local-first memory',
    todayLabel: 'Today',
    status: 'Status',
    loading: 'Loading local data...',
    checking: 'Checking local data...',
    noSync: 'No sync state yet.',
    completedToday: (count: number) => `${count} completed today`,
    pendingSync: (count: number) => `${count} pending sync events`,
    topTitle: 'Review-first desktop client',
    refresh: 'Refresh',
    startReview: 'Start Review',
    focus: 'Focus',
    dueNow: (count: number) => `${count} cards are ready right now`,
    heroBody: 'Flip and score stay local. Cloud sync stays in the background where it belongs.',
    reviewAll: 'Review all due cards',
    browseDecks: 'Browse decks',
    completed: 'Completed',
    streak: 'Streak',
    longest: 'Longest',
    pending: 'Pending Sync',
    days: 'days',
    decks: 'Decks',
    chooseLane: 'Choose a lane',
    reviewSession: 'Review Session',
    dueCount: (count: number) => `${count} due now`,
    revealHint: 'Click or press Space to reveal',
    scoreHint: 'Choose a rating to move on',
    emptyReviewTitle: 'No due cards left',
    emptyReviewBody: 'This session is done. The next batch can pick up from here.',
    shortcuts: 'Shortcuts',
    shortcutReveal: 'Space to reveal',
    shortcutRate: '1 / 2 / 3 / 4 to score',
    shortcutUndo: 'Undo restores the previous card',
    sessionControl: 'Session Control',
    reveal: 'Reveal answer',
    undo: 'Undo last score',
    deleteCurrent: 'Delete this card',
    reload: 'Reload session',
    localLibrary: 'Local library',
    cardsAndDue: (total: number, due: number) => `${total} cards · ${due} due`,
    selectedDeck: 'Selected deck',
    reviewDeck: 'Review this deck',
    deleteDeck: 'Delete deck',
    nextDue: (state: string, due: string) => `${state} · due ${due}`,
    delete: 'Delete',
    noCardsTitle: 'No cards in this deck',
    noCardsBody: 'Use CLI or the web app to add more cards, then review here.',
    selectDeckTitle: 'Select a deck',
    selectDeckBody: 'Deck details and deletion live here.',
    settings: 'Settings',
    settingsTitle: 'App settings',
    settingsBody: 'Language and sync live here, so the main screens stay focused.',
    language: 'Interface language',
    languageHelp: 'Only UI text changes. Card content stays as-is.',
    syncTitle: 'Cloudflare sync',
    syncBody: 'Manual sync uploads local reviews and deletes first, then refreshes the local deck and card snapshot.',
    syncUrl: 'API URL',
    syncKey: 'API Key',
    syncSave: 'Save settings',
    syncNow: 'Sync now',
    syncExit: 'If pending events exist, the app syncs every 5 minutes and once again before closing.',
    syncAuto: 'Auto sync',
    syncAutoBody: 'Runs only when local review or delete changes are waiting to upload.',
    syncReady: 'Sync settings saved.',
    syncStarted: 'Sync started. Exchanging data with Cloudflare...',
    syncSaving: 'Saving sync settings...',
    syncRunning: 'Sync in progress',
    syncDone: (result: SyncResult) =>
      `Sync complete: ${result.uploadedReviews} reviews uploaded, ${result.deletedCards} cards and ${result.deletedDecks} decks deleted, ${result.importedDecks} decks and ${result.importedCards} cards imported.`,
    pendingEvents: 'Pending events',
    pendingEventsBody: 'These changes are already local, but not pushed to the cloud yet.',
    lastSync: 'Last sync',
    never: 'Never',
    lastSyncBody: 'After the first successful sync, the latest timestamp shows here.',
    mode: 'Mode',
    offlineReady: 'Offline ready',
    modeChecking: 'Checking',
    modeBody: 'Flip and score never depend on the network.',
    deletedCard: 'Card moved to trash and removed from the active queue.',
    deletedDeck: 'Deck deleted.',
    loadLocalError: 'Failed to load local data.',
    loadCardsError: 'Failed to load cards.',
    startReviewError: 'Failed to start review.',
    scoreError: 'Failed to score card.',
    undoError: 'Failed to undo review.',
    deleteCardError: 'Failed to delete card.',
    deleteDeckError: 'Failed to delete deck.',
  },
} as const

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'zh'
    const saved = window.localStorage.getItem('recall-mac-language')
    return saved === 'en' ? 'en' : 'zh'
  })
  const [view, setView] = useState<View>('today')
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [activeDeck, setActiveDeck] = useState<DeckSummary | null>(null)
  const [deckCards, setDeckCards] = useState<CardSummary[]>([])
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null)
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({ apiUrl: '', apiKey: '' })
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncStage, setSyncStage] = useState<SyncStage>('idle')
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closingRef = useRef(false)

  const currentCard = reviewSession?.cards[0] ?? null
  const t = copy[language]
  const isWorking = busy || syncBusy
  const hasSyncConfig = Boolean(syncSettings.apiUrl.trim() && syncSettings.apiKey.trim())

  useEffect(() => {
    window.localStorage.setItem('recall-mac-language', language)
  }, [language])

  const refreshSnapshot = useCallback(async () => {
    try {
      const next = await loadSnapshot()
      setError(null)
      startTransition(() => {
        setSnapshot(next)
        if (!activeDeck && next.decks[0]) {
          setActiveDeck(next.decks[0])
        } else if (activeDeck) {
          const match = next.decks.find((deck) => deck.id === activeDeck.id) ?? null
          setActiveDeck(match)
        }
      })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.loadLocalError)
    }
  }, [activeDeck, t.loadLocalError])

  const refreshSyncSettings = useCallback(async () => {
    try {
      const next = await getSyncSettings()
      setError(null)
      setSyncSettings(next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.loadLocalError)
    }
  }, [t.loadLocalError])

  const loadDeckCards = useCallback(async (deckId: string) => {
    try {
      const cards = await listCards(deckId)
      setError(null)
      setDeckCards(cards)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.loadCardsError)
    }
  }, [t.loadCardsError])

  const beginReview = useCallback(
    async (deckId?: string, nextView: View = 'review') => {
      setBusy(true)
      setError(null)
      setMessage(null)
      try {
        const session = await startReview(deckId)
        startTransition(() => {
          setReviewSession(session)
          setRevealed(false)
          setUndoState(null)
          setView(nextView)
        })
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t.startReviewError)
      } finally {
        setBusy(false)
      }
    },
    [t.startReviewError],
  )

  const scoreCard = useCallback(
    async (rating: number) => {
      if (!currentCard) return
      setBusy(true)
      setError(null)
      try {
        const result = await submitReview(currentCard.id, rating)
        startTransition(() => {
          setUndoState({ previousCard: result.previousCard, logId: result.logId })
          setReviewSession((session) =>
            session
              ? {
                  ...session,
                  cards: session.cards.slice(1),
                }
              : session,
          )
          setRevealed(false)
        })
        void refreshSnapshot()
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : t.scoreError)
      } finally {
        setBusy(false)
      }
    },
    [currentCard, refreshSnapshot, t.scoreError],
  )

  useEffect(() => {
    void refreshSnapshot()
  }, [refreshSnapshot])

  useEffect(() => {
    void refreshSyncSettings()
  }, [refreshSyncSettings])

  useEffect(() => {
    if (!activeDeck) return
    void loadDeckCards(activeDeck.id)
  }, [activeDeck, loadDeckCards])

  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      if (view !== 'review' || !currentCard) return
      if (event.code === 'Space') {
        event.preventDefault()
        setRevealed(true)
        return
      }
      const rating = Number(event.key)
      if (revealed && rating >= 1 && rating <= 4) {
        event.preventDefault()
        void scoreCard(rating)
      }
    }

    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [view, currentCard, revealed, scoreCard])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    let unlisten: (() => void) | undefined

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closingRef.current) return
        event.preventDefault()
        closingRef.current = true
        try {
          if (syncSettings.apiUrl.trim() && syncSettings.apiKey.trim() && (snapshot?.pendingSync ?? 0) > 0) {
            await syncNow()
          }
        } catch (nextError) {
          console.error(nextError)
        } finally {
          await getCurrentWindow().destroy()
        }
      })
      .then((off) => {
        unlisten = off
      })

    return () => {
      unlisten?.()
    }
  }, [snapshot?.pendingSync, syncSettings.apiKey, syncSettings.apiUrl])

  async function handleUndo() {
    if (!undoState) return
    setBusy(true)
    setError(null)
    try {
      await undoReview(undoState.previousCard, undoState.logId)
      const restored = undoState.previousCard
      startTransition(() => {
        setReviewSession((session) => ({
          deckLabel: session?.deckLabel ?? restored.deckName,
          cards: [
            {
              ...restored,
              preview: [
                { rating: 1, label: '重来 Again', intervalLabel: '1 min' },
                { rating: 2, label: '困难 Hard', intervalLabel: '10 mins' },
                { rating: 3, label: '良好 Good', intervalLabel: '1 day' },
                { rating: 4, label: '简单 Easy', intervalLabel: '3 days' },
              ],
            },
            ...(session?.cards ?? []),
          ],
        }))
        setUndoState(null)
        setRevealed(false)
      })
      void refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.undoError)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!activeDeck) return
    setBusy(true)
    setError(null)
    try {
      await deleteCard(cardId)
      setMessage(t.deletedCard)
      await Promise.all([loadDeckCards(activeDeck.id), refreshSnapshot()])
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.deleteCardError)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteCurrentCard() {
    if (!currentCard) return
    setBusy(true)
    setError(null)
    try {
      await deleteCard(currentCard.id)
      setMessage(t.deletedCard)
      startTransition(() => {
        setReviewSession((session) =>
          session
            ? {
                ...session,
                cards: session.cards.slice(1),
              }
            : session,
        )
        setRevealed(false)
        setUndoState(null)
      })
      await refreshSnapshot()
      if (activeDeck) {
        await loadDeckCards(activeDeck.id)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.deleteCardError)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteDeck(deckId: string) {
    setBusy(true)
    setError(null)
    try {
      await deleteDeck(deckId)
      setMessage(t.deletedDeck)
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.deleteDeckError)
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveSyncSettings() {
    setSyncBusy(true)
    setSyncStage('saving')
    setError(null)
    setMessage(null)
    try {
      const saved = await saveSyncSettings(syncSettings.apiUrl, syncSettings.apiKey)
      setSyncSettings(saved)
      setMessage(t.syncReady)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.loadLocalError)
    } finally {
      setSyncBusy(false)
      setSyncStage('idle')
    }
  }

  const performSync = useCallback(async () => {
    if (!hasSyncConfig || (snapshot?.pendingSync ?? 0) === 0) {
      return null
    }

    setSyncBusy(true)
    setSyncStage('syncing')
    setError(null)
    setMessage(null)
    try {
      const result = await syncNow()
      setMessage(t.syncDone(result))
      await Promise.all([refreshSnapshot(), refreshSyncSettings()])
      if (activeDeck) {
        await loadDeckCards(activeDeck.id)
      }
      return result
    } catch (nextError) {
      setMessage(null)
      setError(nextError instanceof Error ? nextError.message : t.loadLocalError)
      return null
    } finally {
      setSyncBusy(false)
      setSyncStage('idle')
    }
  }, [activeDeck, hasSyncConfig, loadDeckCards, refreshSnapshot, refreshSyncSettings, snapshot?.pendingSync, t])

  useEffect(() => {
    if (!isDesktopRuntime() || !hasSyncConfig) return

    const timer = window.setInterval(() => {
      if (closingRef.current) return
      if (busy || syncBusy) return
      if ((snapshot?.pendingSync ?? 0) === 0) return
      void performSync()
    }, 5 * 60 * 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [busy, hasSyncConfig, performSync, snapshot?.pendingSync, syncBusy])

  async function handleManualSync() {
    await performSync()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <div className="eyebrow">{t.localFirst}</div>
            <h1>Recall</h1>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={clsx('nav-link', { active: view === item.id })}
              onClick={() => setView(item.id)}
              type="button"
            >
              {t.nav[item.id]}
            </button>
          ))}
        </nav>

        <section className="sidebar-panel">
          <div className="eyebrow">{t.todayLabel}</div>
          <div className="sidebar-metric">{snapshot?.dueToday ?? '-'}</div>
          <p>{snapshot ? t.completedToday(snapshot.completedToday) : t.loading}</p>
        </section>

        <section className="sidebar-panel">
          <div className="eyebrow">{t.status}</div>
          <p>{snapshot?.offlineReady ? t.offlineReady : t.checking}</p>
          <p>{snapshot ? t.pendingSync(snapshot.pendingSync) : t.noSync}</p>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Mac MVP</div>
            <h2>{t.topTitle}</h2>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" disabled={isWorking} onClick={() => void refreshSnapshot()} type="button">
              {t.refresh}
            </button>
            <button className="primary-button" disabled={isWorking} onClick={() => void beginReview()} type="button">
              {t.startReview}
            </button>
          </div>
        </header>

        {syncStage !== 'idle' ? (
          <section className="sync-progress" aria-live="polite">
            <div className="sync-progress-copy">
              <strong>{syncStage === 'saving' ? t.syncSaving : t.syncRunning}</strong>
              <span>{syncStage === 'saving' ? t.syncReady : t.syncStarted}</span>
            </div>
            <div className="sync-progress-track">
              <div className="sync-progress-bar" />
            </div>
          </section>
        ) : null}

        {error ? <div className="banner error">{error}</div> : null}
        {message ? <div className="banner success">{message}</div> : null}

        {view === 'today' ? (
          <section className="grid-layout">
            <article className="hero-panel">
              <div className="eyebrow">{t.focus}</div>
              <h3>{t.dueNow(snapshot?.dueToday ?? 0)}</h3>
              <p>{t.heroBody}</p>
              <div className="hero-actions">
                <button className="primary-button" disabled={isWorking} onClick={() => void beginReview()} type="button">
                  {t.reviewAll}
                </button>
                <button className="secondary-button" disabled={isWorking} onClick={() => setView('decks')} type="button">
                  {t.browseDecks}
                </button>
              </div>
            </article>

            <article className="metric-grid">
              <div className="metric-card">
                <span className="eyebrow">{t.completed}</span>
                <strong>{snapshot?.completedToday ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span className="eyebrow">{t.streak}</span>
                <strong>
                  {snapshot?.streak ?? 0} {t.days}
                </strong>
              </div>
              <div className="metric-card">
                <span className="eyebrow">{t.longest}</span>
                <strong>
                  {snapshot?.longestStreak ?? 0} {t.days}
                </strong>
              </div>
              <div className="metric-card">
                <span className="eyebrow">{t.pending}</span>
                <strong>{snapshot?.pendingSync ?? 0}</strong>
              </div>
            </article>

            <article className="deck-list-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">{t.decks}</div>
                  <h3>{t.chooseLane}</h3>
                </div>
              </div>

              <div className="deck-stack">
                {snapshot?.decks.map((deck) => (
                  <button
                    key={deck.id}
                    className="deck-row"
                    onClick={() => {
                      setActiveDeck(deck)
                      void beginReview(deck.id)
                    }}
                    type="button"
                  >
                    <div>
                      <strong>{deck.name}</strong>
                      <p>{deck.description}</p>
                    </div>
                    <div className="deck-pill">{deck.dueCount}</div>
                  </button>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {view === 'review' ? (
          <section className="review-layout">
            <div className="review-panel">
              <div className="review-header">
                <div>
                  <div className="eyebrow">{t.reviewSession}</div>
                  <h3>{reviewSession?.deckLabel ?? 'All Decks'}</h3>
                </div>
                <div className="review-progress">
                  <strong>{reviewSession ? `${reviewSession.cards.length > 0 ? 1 : 0}/${Math.max(reviewSession.cards.length, 1)}` : '0/0'}</strong>
                  <span>{t.dueCount(reviewSession?.cards.length ?? 0)}</span>
                </div>
              </div>

              {currentCard ? (
                <>
                  <div
                    className="card-surface"
                    onClick={() => setRevealed(true)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setRevealed(true)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="state-tag">{currentCard.state}</div>
                    <div className="card-copy">
                      <ReactMarkdown>{currentCard.front}</ReactMarkdown>
                    </div>
                    {revealed ? <div className="divider">----</div> : null}
                    {revealed ? (
                      <div className="card-copy answer">
                        <ReactMarkdown>{currentCard.back}</ReactMarkdown>
                      </div>
                    ) : null}
                    <div className="flip-hint">{revealed ? t.scoreHint : t.revealHint}</div>
                  </div>

                  <div className="rating-row">
                    {currentCard.preview.map((item) => (
                      <button
                        key={item.rating}
                        className={clsx('rating-button', `tone-${item.rating}`)}
                        disabled={!revealed || busy}
                        onClick={() => void scoreCard(item.rating)}
                        type="button"
                      >
                        <span>{item.label}</span>
                        <small>{item.intervalLabel}</small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-panel">
                  <div className="eyebrow">{language === 'zh' ? '已清空' : 'Clear'}</div>
                  <h3>{t.emptyReviewTitle}</h3>
                  <p>{t.emptyReviewBody}</p>
                </div>
              )}
            </div>

            <div className="review-side">
              <div className="side-card">
                <div className="eyebrow">{t.shortcuts}</div>
                <ul>
                  <li>{t.shortcutReveal}</li>
                  <li>{t.shortcutRate}</li>
                  <li>{t.shortcutUndo}</li>
                </ul>
              </div>

              <div className="side-card">
                <div className="eyebrow">{t.sessionControl}</div>
                <button className="secondary-button stretch" disabled={busy} onClick={() => setRevealed(true)} type="button">
                  {t.reveal}
                </button>
                <button className="secondary-button stretch" disabled={!undoState || busy} onClick={() => void handleUndo()} type="button">
                  {t.undo}
                </button>
                <button className="danger-button stretch" disabled={!currentCard || busy} onClick={() => void handleDeleteCurrentCard()} type="button">
                  {t.deleteCurrent}
                </button>
                <button className="ghost-button stretch" disabled={busy} onClick={() => void beginReview(activeDeck?.id)} type="button">
                  {t.reload}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {view === 'decks' ? (
          <section className="decks-layout">
            <aside className="deck-index">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">{t.decks}</div>
                  <h3>{t.localLibrary}</h3>
                </div>
              </div>
              <div className="deck-stack">
                {snapshot?.decks.map((deck) => (
                  <button
                    key={deck.id}
                    className={clsx('deck-row', { selected: activeDeck?.id === deck.id })}
                    onClick={() => setActiveDeck(deck)}
                    type="button"
                  >
                    <div>
                      <strong>{deck.name}</strong>
                      <p>{t.cardsAndDue(deck.totalCards, deck.dueCount)}</p>
                    </div>
                    <div className="deck-pill">{deck.dueCount}</div>
                  </button>
                ))}
              </div>
            </aside>

            <article className="deck-detail">
              {activeDeck ? (
                <>
                  <div className="panel-heading">
                    <div>
                      <div className="eyebrow">{t.selectedDeck}</div>
                      <h3>{activeDeck.name}</h3>
                      <p>{activeDeck.description}</p>
                    </div>
                    <div className="topbar-actions">
                      <button className="secondary-button" disabled={isWorking} onClick={() => void beginReview(activeDeck.id)} type="button">
                        {t.reviewDeck}
                      </button>
                      <button className="danger-button" disabled={isWorking} onClick={() => void handleDeleteDeck(activeDeck.id)} type="button">
                        {t.deleteDeck}
                      </button>
                    </div>
                  </div>

                  <div className="card-table">
                    {deckCards.map((card) => (
                      <div key={card.id} className="card-row">
                        <div>
                          <strong>{card.front}</strong>
                          <p>{t.nextDue(card.state, formatDate(card.dueAt))}</p>
                        </div>
                        <button className="ghost-button" disabled={isWorking} onClick={() => void handleDeleteCard(card.id)} type="button">
                          {t.delete}
                        </button>
                      </div>
                    ))}
                    {deckCards.length === 0 ? (
                      <div className="empty-panel compact">
                        <h3>{t.noCardsTitle}</h3>
                        <p>{t.noCardsBody}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="empty-panel">
                  <h3>{t.selectDeckTitle}</h3>
                  <p>{t.selectDeckBody}</p>
                </div>
              )}
            </article>
          </section>
        ) : null}

        {view === 'settings' ? (
          <section className="settings-layout">
            <article className="sync-hero">
              <div className="eyebrow">{t.settings}</div>
              <h3>{t.settingsTitle}</h3>
              <p>{t.settingsBody}</p>
            </article>

            <article className="settings-grid">
              <div className="metric-card tall settings-card">
                <span className="eyebrow">{t.language}</span>
                <div className="language-switch" role="group" aria-label={t.language}>
                  <button className={clsx('chip-button', { active: language === 'zh' })} onClick={() => setLanguage('zh')} type="button">
                    中文
                  </button>
                  <button className={clsx('chip-button', { active: language === 'en' })} onClick={() => setLanguage('en')} type="button">
                    English
                  </button>
                </div>
                <p>{t.languageHelp}</p>
              </div>

              <div className="metric-card tall settings-card">
                <span className="eyebrow">{t.syncTitle}</span>
                <p>{t.syncBody}</p>
                <label className="field-label">
                  <span>{t.syncUrl}</span>
                  <input
                    className="text-input"
                    onChange={(event) => setSyncSettings((current) => ({ ...current, apiUrl: event.target.value }))}
                    placeholder="https://recall.zhong4092.workers.dev"
                    value={syncSettings.apiUrl}
                  />
                </label>
                <label className="field-label">
                  <span>{t.syncKey}</span>
                  <input
                    className="text-input"
                    onChange={(event) => setSyncSettings((current) => ({ ...current, apiKey: event.target.value }))}
                    placeholder="Bearer key"
                    type="password"
                    value={syncSettings.apiKey}
                  />
                </label>
                <div className="sync-actions">
                  <button className="secondary-button" disabled={syncBusy} onClick={() => void handleSaveSyncSettings()} type="button">
                    {t.syncSave}
                  </button>
                  <button className="primary-button" disabled={syncBusy} onClick={() => void handleManualSync()} type="button">
                    {t.syncNow}
                  </button>
                </div>
                <p>{t.syncExit}</p>
              </div>

              <div className="metric-card tall">
                <span className="eyebrow">{t.pendingEvents}</span>
                <strong>{snapshot?.pendingSync ?? 0}</strong>
                <p>{t.pendingEventsBody}</p>
              </div>
              <div className="metric-card tall">
                <span className="eyebrow">{t.lastSync}</span>
                <strong>{snapshot?.lastSyncAt ? formatDate(snapshot.lastSyncAt) : t.never}</strong>
                <p>{t.lastSyncBody}</p>
              </div>
              <div className="metric-card tall">
                <span className="eyebrow">{t.mode}</span>
                <strong>{snapshot?.offlineReady ? t.offlineReady : t.modeChecking}</strong>
                <p>{t.modeBody}</p>
              </div>
              <div className="metric-card tall">
                <span className="eyebrow">{t.syncAuto}</span>
                <strong>5 min</strong>
                <p>{t.syncAutoBody}</p>
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default App
