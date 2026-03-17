use std::{
    env, fs,
    path::{Path, PathBuf},
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, Utc};
use directories::ProjectDirs;
use reqwest::blocking::Client;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Clone)]
pub struct DatabaseState {
    pub path: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub due_today: i64,
    pub completed_today: i64,
    pub pending_sync: i64,
    pub streak: i64,
    pub longest_streak: i64,
    pub last_sync_at: Option<String>,
    pub offline_ready: bool,
    pub decks: Vec<DeckSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub due_count: i64,
    pub total_cards: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardSummary {
    pub id: String,
    pub front: String,
    pub back: String,
    pub state: String,
    pub due_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    pub deck_label: String,
    pub cards: Vec<ReviewCard>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCard {
    pub id: String,
    pub deck_id: String,
    pub deck_name: String,
    pub front: String,
    pub back: String,
    pub due_at: String,
    pub state: String,
    pub reps: i64,
    pub lapses: i64,
    pub scheduled_days: i64,
    pub preview: Vec<RatingPreview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RatingPreview {
    pub rating: i64,
    pub label: String,
    pub interval_label: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardSnapshot {
    pub id: String,
    pub deck_id: String,
    pub deck_name: String,
    pub front: String,
    pub back: String,
    pub due_at: String,
    pub state: String,
    pub reps: i64,
    pub lapses: i64,
    pub scheduled_days: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewUpdate {
    pub card_id: String,
    pub log_id: String,
    pub previous_card: CardSnapshot,
    pub next_card: CardSnapshot,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCardResult {
    pub card_id: String,
    pub deck_name: String,
    pub front: String,
    pub trashed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDeckResult {
    pub deck_id: String,
    pub deck_name: String,
    pub deleted_cards: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    pub api_url: String,
    pub api_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub uploaded_reviews: i64,
    pub deleted_cards: i64,
    pub deleted_decks: i64,
    pub imported_decks: i64,
    pub imported_cards: i64,
    pub synced_at: String,
}

#[derive(Debug)]
struct CardRow {
    id: String,
    deck_id: String,
    deck_name: String,
    front: String,
    back: String,
    due_at: String,
    state: String,
    reps: i64,
    lapses: i64,
    scheduled_days: i64,
}

#[derive(Debug)]
struct PendingOpRow {
    id: String,
    kind: String,
    entity_id: String,
    correlation_id: Option<String>,
    payload: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudDeck {
    id: String,
    name: String,
    desc: String,
    archived: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudCard {
    id: String,
    deck_id: String,
    front: String,
    back: String,
    created_at: String,
    updated_at: String,
    due: String,
    reps: i64,
    lapses: i64,
    scheduled_days: i64,
    state: i64,
}

#[derive(Debug, Deserialize)]
struct CloudSnapshot {
    decks: Vec<CloudDeck>,
    cards: Vec<CloudCard>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CliConfig {
    url: String,
    key: String,
}

pub fn init_database_state() -> Result<DatabaseState, String> {
    let project_dirs = ProjectDirs::from("work", "zhongyi", "RecallMac")
        .ok_or_else(|| String::from("Failed to resolve app data directory"))?;
    let data_dir = project_dirs.data_dir();
    fs::create_dir_all(data_dir).map_err(|error| error.to_string())?;
    let path = data_dir.join("recall-mac.sqlite");
    initialize_database(&path)?;
    hydrate_sync_settings(&path)?;
    Ok(DatabaseState { path })
}

pub fn load_snapshot(path: &Path) -> Result<AppSnapshot, String> {
    let connection = open_connection(path)?;

    let due_today = connection
        .query_row(
            "SELECT COUNT(*) FROM cards c
             INNER JOIN decks d ON d.id = c.deck_id
             WHERE d.archived = 0 AND datetime(c.due_at) <= datetime('now')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;

    let completed_today = connection
        .query_row(
            "SELECT COUNT(*) FROM review_logs WHERE substr(reviewed_at, 1, 10) = substr(datetime('now'), 1, 10)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;

    let pending_sync = connection
        .query_row("SELECT COUNT(*) FROM pending_ops", [], |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;

    let last_sync_at = connection
        .query_row(
            "SELECT value FROM meta WHERE key = 'last_sync_at'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .and_then(empty_to_none);

    let mut statement = connection
        .prepare(
            "SELECT
                d.id,
                d.name,
                d.description,
                SUM(CASE WHEN d.archived = 0 AND datetime(c.due_at) <= datetime('now') THEN 1 ELSE 0 END) AS due_count,
                COUNT(c.id) AS total_cards
             FROM decks d
             LEFT JOIN cards c ON c.deck_id = d.id
             GROUP BY d.id
             ORDER BY due_count DESC, total_cards DESC, d.updated_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let decks = statement
        .query_map([], |row| {
            Ok(DeckSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                due_count: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                total_cards: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let (streak, longest_streak) = compute_streaks(&connection)?;

    Ok(AppSnapshot {
        due_today,
        completed_today,
        pending_sync,
        streak,
        longest_streak,
        last_sync_at,
        offline_ready: true,
        decks,
    })
}

pub fn get_sync_settings(path: &Path) -> Result<SyncSettings, String> {
    let connection = open_connection(path)?;
    Ok(read_sync_settings(&connection))
}

pub fn save_sync_settings(path: &Path, settings: SyncSettings) -> Result<SyncSettings, String> {
    let connection = open_connection(path)?;
    write_sync_settings(&connection, &settings)?;
    Ok(read_sync_settings(&connection))
}

pub fn sync_now(path: &Path) -> Result<SyncResult, String> {
    let mut connection = open_connection(path)?;
    let settings = read_sync_settings(&connection);
    if settings.api_url.trim().is_empty() || settings.api_key.trim().is_empty() {
        return Err(String::from("请先在同步页填写 API URL 和 API Key"));
    }

    let client = Client::builder()
        .timeout(StdDuration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())?;

    let pending = read_pending_ops(&connection)?;
    let mut uploaded_reviews = 0;
    let mut deleted_cards = 0;
    let mut deleted_decks = 0;

    for op in pending {
        let response = match op.kind.as_str() {
            "review" => {
                let payload: Value =
                    serde_json::from_str(&op.payload).map_err(|error| error.to_string())?;
                let card_id = payload
                    .get("cardId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| String::from("Invalid review payload"))?;
                let rating = payload
                    .get("rating")
                    .and_then(Value::as_i64)
                    .ok_or_else(|| String::from("Invalid review rating"))?;
                client
                    .post(format!("{}/api/review/{}", normalize_api_url(&settings.api_url), card_id))
                    .bearer_auth(&settings.api_key)
                    .json(&json!({ "rating": rating }))
                    .send()
                    .map_err(|error| error.to_string())?
            }
            "delete_card" => client
                .delete(format!(
                    "{}/api/cards/{}",
                    normalize_api_url(&settings.api_url),
                    op.entity_id
                ))
                .bearer_auth(&settings.api_key)
                .send()
                .map_err(|error| error.to_string())?,
            "delete_deck" => client
                .delete(format!(
                    "{}/api/decks/{}",
                    normalize_api_url(&settings.api_url),
                    op.entity_id
                ))
                .bearer_auth(&settings.api_key)
                .send()
                .map_err(|error| error.to_string())?,
            _ => return Err(format!("Unknown pending op kind: {}", op.kind)),
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().unwrap_or_default();
            return Err(format!("Sync failed for {} {}: {} {}", op.kind, op.entity_id, status, body));
        }

        match op.kind.as_str() {
            "review" => {
                uploaded_reviews += 1;
                if let Some(correlation_id) = op.correlation_id.as_deref() {
                    connection
                        .execute(
                            "UPDATE review_logs SET synced = 1 WHERE id = ?",
                            [correlation_id],
                        )
                        .map_err(|error| error.to_string())?;
                }
            }
            "delete_card" => deleted_cards += 1,
            "delete_deck" => deleted_decks += 1,
            _ => {}
        }

        connection
            .execute("DELETE FROM pending_ops WHERE id = ?", [op.id])
            .map_err(|error| error.to_string())?;
    }

    let snapshot = client
        .get(format!("{}/api/sync/export", normalize_api_url(&settings.api_url)))
        .bearer_auth(&settings.api_key)
        .send()
        .map_err(|error| error.to_string())?;

    if !snapshot.status().is_success() {
        let status = snapshot.status();
        let body = snapshot.text().unwrap_or_default();
        return Err(format!("Sync export failed: {} {}", status, body));
    }

    let remote: CloudSnapshot = snapshot.json().map_err(|error| error.to_string())?;
    merge_cloud_snapshot(&mut connection, &remote)?;

    let synced_at = now_rfc3339();
    connection
        .execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_sync_at', ?)",
            [synced_at.as_str()],
        )
        .map_err(|error| error.to_string())?;

    Ok(SyncResult {
        uploaded_reviews,
        deleted_cards,
        deleted_decks,
        imported_decks: remote.decks.len() as i64,
        imported_cards: remote.cards.len() as i64,
        synced_at,
    })
}

pub fn list_cards(path: &Path, deck_id: &str) -> Result<Vec<CardSummary>, String> {
    let connection = open_connection(path)?;
    let mut statement = connection
        .prepare(
            "SELECT c.id, c.front, c.back, c.state, c.due_at
             FROM cards c
             WHERE c.deck_id = ?
             ORDER BY datetime(c.due_at) ASC, c.created_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let cards = statement
        .query_map([deck_id], |row| {
            Ok(CardSummary {
                id: row.get(0)?,
                front: row.get(1)?,
                back: row.get(2)?,
                state: row.get(3)?,
                due_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    Ok(cards)
}

pub fn start_review(path: &Path, deck_id: Option<&str>) -> Result<ReviewSession, String> {
    let connection = open_connection(path)?;
    let deck_label = if let Some(id) = deck_id {
        connection
            .query_row("SELECT name FROM decks WHERE id = ?", [id], |row| row.get::<_, String>(0))
            .optional()
            .map_err(|error| error.to_string())?
            .unwrap_or_else(|| String::from("Selected Deck"))
    } else {
        String::from("All Decks")
    };

    let mut query = String::from(
        "SELECT
            c.id,
            c.deck_id,
            d.name,
            c.front,
            c.back,
            c.due_at,
            c.state,
            c.reps,
            c.lapses,
            c.scheduled_days
         FROM cards c
         INNER JOIN decks d ON d.id = c.deck_id
         WHERE d.archived = 0
           AND datetime(c.due_at) <= datetime('now')",
    );

    if deck_id.is_some() {
        query.push_str(" AND c.deck_id = ?");
    }

    query.push_str(" ORDER BY datetime(c.due_at) ASC LIMIT 150");

    let mut statement = connection.prepare(&query).map_err(|error| error.to_string())?;
    let rows = if let Some(id) = deck_id {
        statement
            .query_map([id], map_card_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    } else {
        statement
            .query_map([], map_card_row)
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?
    };

    Ok(ReviewSession {
        deck_label,
        cards: rows.into_iter().map(to_review_card).collect(),
    })
}

pub fn submit_review(path: &Path, card_id: &str, rating: i64) -> Result<ReviewUpdate, String> {
    let mut connection = open_connection(path)?;
    let previous = get_card(&connection, card_id)?.ok_or_else(|| String::from("Card not found"))?;
    let next = schedule_card(&previous, rating)?;
    let log_id = Uuid::new_v4().to_string();
    let reviewed_at = now_rfc3339();
    let op_id = Uuid::new_v4().to_string();
    let tx = connection.transaction().map_err(|error| error.to_string())?;

    tx.execute(
        "UPDATE cards
         SET due_at = ?, state = ?, reps = ?, lapses = ?, scheduled_days = ?, updated_at = ?
         WHERE id = ?",
        params![
            next.due_at,
            next.state,
            next.reps,
            next.lapses,
            next.scheduled_days,
            reviewed_at,
            card_id
        ],
    )
    .map_err(|error| error.to_string())?;

    tx.execute(
        "INSERT INTO review_logs (
            id, card_id, rating, reviewed_at, previous_due_at, next_due_at, scheduled_days, synced
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
        params![
            log_id,
            card_id,
            rating,
            reviewed_at,
            previous.due_at,
            next.due_at,
            next.scheduled_days
        ],
    )
    .map_err(|error| error.to_string())?;

    tx.execute(
        "INSERT INTO pending_ops (id, kind, entity_id, correlation_id, payload, created_at)
         VALUES (?, 'review', ?, ?, ?, ?)",
        params![
            op_id,
            card_id,
            log_id,
            json!({ "cardId": card_id, "rating": rating, "logId": log_id }).to_string(),
            reviewed_at
        ],
    )
    .map_err(|error| error.to_string())?;

    tx.commit().map_err(|error| error.to_string())?;

    Ok(ReviewUpdate {
        card_id: card_id.to_string(),
        log_id,
        previous_card: to_card_snapshot(previous),
        next_card: next,
    })
}

pub fn undo_review(path: &Path, card: CardSnapshot, log_id: &str) -> Result<(), String> {
    let mut connection = open_connection(path)?;
    let tx = connection.transaction().map_err(|error| error.to_string())?;

    tx.execute(
        "UPDATE cards
         SET due_at = ?, state = ?, reps = ?, lapses = ?, scheduled_days = ?, updated_at = ?
         WHERE id = ?",
        params![
            card.due_at,
            card.state,
            card.reps,
            card.lapses,
            card.scheduled_days,
            now_rfc3339(),
            card.id
        ],
    )
    .map_err(|error| error.to_string())?;

    tx.execute("DELETE FROM review_logs WHERE id = ?", [log_id])
        .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM pending_ops WHERE kind = 'review' AND correlation_id = ?",
        [log_id],
    )
    .map_err(|error| error.to_string())?;

    tx.commit().map_err(|error| error.to_string())
}

pub fn delete_card(path: &Path, card_id: &str) -> Result<DeleteCardResult, String> {
    let mut connection = open_connection(path)?;
    let card = get_card(&connection, card_id)?.ok_or_else(|| String::from("Card not found"))?;
    let tx = connection.transaction().map_err(|error| error.to_string())?;
    archive_card_to_trash(&tx, &card, "manual_delete")?;

    tx.execute("DELETE FROM review_logs WHERE card_id = ?", [card_id])
        .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM pending_ops WHERE entity_id = ? AND kind = 'review'",
        [card_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM cards WHERE id = ?", [card_id])
        .map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE decks SET updated_at = ? WHERE id = ?",
        params![now_rfc3339(), card.deck_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO pending_ops (id, kind, entity_id, correlation_id, payload, created_at)
         VALUES (?, 'delete_card', ?, NULL, ?, ?)",
        params![
            Uuid::new_v4().to_string(),
            card_id,
            json!({ "cardId": card_id }).to_string(),
            now_rfc3339()
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;

    Ok(DeleteCardResult {
        card_id: card.id,
        deck_name: card.deck_name,
        front: card.front,
        trashed: true,
    })
}

pub fn delete_deck(path: &Path, deck_id: &str) -> Result<DeleteDeckResult, String> {
    let mut connection = open_connection(path)?;
    let deck_name = connection
        .query_row("SELECT name FROM decks WHERE id = ?", [deck_id], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| String::from("Deck not found"))?;

    let deleted_cards = connection
        .query_row(
            "SELECT COUNT(*) FROM cards WHERE deck_id = ?",
            [deck_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| error.to_string())?;

    let tx = connection.transaction().map_err(|error| error.to_string())?;
    {
        let mut statement = tx
            .prepare(
                "SELECT c.id, c.deck_id, d.name, c.front, c.back, c.due_at, c.state, c.reps, c.lapses, c.scheduled_days
                 FROM cards c
                 INNER JOIN decks d ON d.id = c.deck_id
                 WHERE c.deck_id = ?",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([deck_id], map_card_row)
            .map_err(|error| error.to_string())?;
        for row in rows {
            let card = row.map_err(|error| error.to_string())?;
            archive_card_to_trash(&tx, &card, "deck_delete")?;
        }
    }
    tx.execute(
        "DELETE FROM review_logs WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)",
        [deck_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "DELETE FROM pending_ops
         WHERE kind = 'review'
           AND entity_id IN (SELECT id FROM cards WHERE deck_id = ?)",
        [deck_id],
    )
    .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM cards WHERE deck_id = ?", [deck_id])
        .map_err(|error| error.to_string())?;
    tx.execute("DELETE FROM decks WHERE id = ?", [deck_id])
        .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO pending_ops (id, kind, entity_id, correlation_id, payload, created_at)
         VALUES (?, 'delete_deck', ?, NULL, ?, ?)",
        params![
            Uuid::new_v4().to_string(),
            deck_id,
            json!({ "deckId": deck_id }).to_string(),
            now_rfc3339()
        ],
    )
    .map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;

    Ok(DeleteDeckResult {
        deck_id: deck_id.to_string(),
        deck_name,
        deleted_cards,
    })
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    Connection::open(path).map_err(|error| error.to_string())
}

fn initialize_database(path: &Path) -> Result<(), String> {
    let connection = open_connection(path)?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;

             CREATE TABLE IF NOT EXISTS decks (
               id TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               description TEXT NOT NULL DEFAULT '',
               archived INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS cards (
               id TEXT PRIMARY KEY,
               deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
               front TEXT NOT NULL,
               back TEXT NOT NULL,
               due_at TEXT NOT NULL,
               state TEXT NOT NULL DEFAULT 'New',
               reps INTEGER NOT NULL DEFAULT 0,
               lapses INTEGER NOT NULL DEFAULT 0,
               scheduled_days INTEGER NOT NULL DEFAULT 0,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS review_logs (
               id TEXT PRIMARY KEY,
               card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
               rating INTEGER NOT NULL,
               reviewed_at TEXT NOT NULL,
               previous_due_at TEXT NOT NULL,
               next_due_at TEXT NOT NULL,
               scheduled_days INTEGER NOT NULL,
               synced INTEGER NOT NULL DEFAULT 0
             );

             CREATE TABLE IF NOT EXISTS trash_cards (
               id TEXT PRIMARY KEY,
               original_card_id TEXT NOT NULL,
               deck_id TEXT NOT NULL,
               deck_name TEXT NOT NULL,
               front TEXT NOT NULL,
               back TEXT NOT NULL,
               state TEXT NOT NULL,
               due_at TEXT NOT NULL,
               reps INTEGER NOT NULL DEFAULT 0,
               lapses INTEGER NOT NULL DEFAULT 0,
               scheduled_days INTEGER NOT NULL DEFAULT 0,
               source TEXT NOT NULL DEFAULT 'manual_delete',
               deleted_at TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS pending_ops (
               id TEXT PRIMARY KEY,
               kind TEXT NOT NULL,
               entity_id TEXT NOT NULL,
               correlation_id TEXT,
               payload TEXT NOT NULL,
               created_at TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS meta (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL
             );

             CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_at);
             CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
             CREATE INDEX IF NOT EXISTS idx_logs_reviewed_at ON review_logs(reviewed_at);
             CREATE INDEX IF NOT EXISTS idx_trash_cards_deleted_at ON trash_cards(deleted_at);
             CREATE INDEX IF NOT EXISTS idx_pending_ops_created_at ON pending_ops(created_at);",
        )
        .map_err(|error| error.to_string())?;

    seed_if_empty(&connection)?;
    Ok(())
}

fn seed_if_empty(connection: &Connection) -> Result<(), String> {
    let deck_count = connection
        .query_row("SELECT COUNT(*) FROM decks", [], |row| row.get::<_, i64>(0))
        .map_err(|error| error.to_string())?;

    if deck_count > 0 {
        return Ok(());
    }

    let now = Utc::now();
    let tx = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    let decks = [
        (
            "ai-insights",
            "AI 洞见 / AI Insights",
            "从 AI 对话里提炼出的高信号卡片。",
            vec![
                (
                    "为什么 active recall 比重读更有效？",
                    "**Active recall** 会强迫大脑主动提取记忆；重读通常只会制造熟悉感。",
                ),
                (
                    "FSRS 为什么比 SM-2 更自适应？",
                    "**FSRS** 会根据真实复习历史动态更新间隔，而不是依赖单一的固定 ease factor。",
                ),
            ],
        ),
        (
            "investing",
            "投资思考 / Investing",
            "值得反复 sharpen 的投资判断。",
            vec![
                (
                    "什么时候共识最不利于收益？",
                    "当所有人都已经同意时，这个观点通常已经被 **fully priced**，上行空间会缩小。",
                ),
                (
                    "Peter Thiel 说哪类秘密对投资者更重要？",
                    "更重要的是 **关于人和制度的秘密**，而不只是关于自然规律的秘密。",
                ),
            ],
        ),
        (
            "systems",
            "系统设计 / Systems",
            "技术结构和架构提醒。",
            vec![(
                "为什么桌面端复习应该保持 local-first？",
                "因为 **翻卡和评分** 不应该等待网络往返；同步应该在后台完成。",
            )],
        ),
    ];

    for (deck_id, name, description, cards) in decks {
        let created_at = now.to_rfc3339();
        tx.execute(
            "INSERT INTO decks (id, name, description, archived, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, ?)",
            params![deck_id, name, description, created_at, created_at],
        )
        .map_err(|error| error.to_string())?;

        for (index, (front, back)) in cards.iter().enumerate() {
            let due = (now - Duration::minutes(index as i64 * 3)).to_rfc3339();
            tx.execute(
                "INSERT INTO cards (
                    id, deck_id, front, back, due_at, state, reps, lapses, scheduled_days, created_at, updated_at
                 ) VALUES (?, ?, ?, ?, ?, 'New', 0, 0, 0, ?, ?)",
                params![Uuid::new_v4().to_string(), deck_id, front, back, due, created_at, created_at],
            )
            .map_err(|error| error.to_string())?;
        }
    }

    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('last_sync_at', '')",
        [],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_api_url', '')",
        [],
    )
    .map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_api_key', '')",
        [],
    )
    .map_err(|error| error.to_string())?;

    tx.commit().map_err(|error| error.to_string())
}

fn hydrate_sync_settings(path: &Path) -> Result<(), String> {
    let connection = open_connection(path)?;
    let existing = read_sync_settings(&connection);
    if !existing.api_url.trim().is_empty() && !existing.api_key.trim().is_empty() {
        return Ok(());
    }

    if let Some(cli) = read_cli_sync_config() {
        let merged = SyncSettings {
            api_url: if existing.api_url.trim().is_empty() {
                cli.url
            } else {
                existing.api_url
            },
            api_key: if existing.api_key.trim().is_empty() {
                cli.key
            } else {
                existing.api_key
            },
        };
        write_sync_settings(&connection, &merged)?;
    }

    Ok(())
}

fn read_cli_sync_config() -> Option<CliConfig> {
    let home = env::var("HOME").ok()?;
    let path = PathBuf::from(home).join(".config/recall/config.json");
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn read_sync_settings(connection: &Connection) -> SyncSettings {
    let api_url = connection
        .query_row(
            "SELECT value FROM meta WHERE key = 'sync_api_url'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    let api_key = connection
        .query_row(
            "SELECT value FROM meta WHERE key = 'sync_api_key'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();

    SyncSettings { api_url, api_key }
}

fn write_sync_settings(connection: &Connection, settings: &SyncSettings) -> Result<(), String> {
    connection
        .execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_api_url', ?)",
            [settings.api_url.trim()],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_api_key', ?)",
            [settings.api_key.trim()],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn read_pending_ops(connection: &Connection) -> Result<Vec<PendingOpRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, kind, entity_id, correlation_id, payload
             FROM pending_ops
             ORDER BY datetime(created_at) ASC, rowid ASC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(PendingOpRow {
                id: row.get(0)?,
                kind: row.get(1)?,
                entity_id: row.get(2)?,
                correlation_id: row.get(3)?,
                payload: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn archive_card_to_trash(
    connection: &Connection,
    card: &CardRow,
    source: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO trash_cards (
                id, original_card_id, deck_id, deck_name, front, back, state, due_at,
                reps, lapses, scheduled_days, source, deleted_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                Uuid::new_v4().to_string(),
                card.id,
                card.deck_id,
                card.deck_name,
                card.front,
                card.back,
                card.state,
                card.due_at,
                card.reps,
                card.lapses,
                card.scheduled_days,
                source,
                now_rfc3339()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn merge_cloud_snapshot(connection: &mut Connection, remote: &CloudSnapshot) -> Result<(), String> {
    let tx = connection.transaction().map_err(|error| error.to_string())?;

    for deck in &remote.decks {
        tx.execute(
            "INSERT INTO decks (id, name, description, archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               archived = excluded.archived,
               created_at = excluded.created_at,
               updated_at = excluded.updated_at",
            params![
                deck.id,
                deck.name,
                deck.desc,
                if deck.archived { 1 } else { 0 },
                deck.created_at,
                deck.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    for card in &remote.cards {
        tx.execute(
            "INSERT INTO cards (
                id, deck_id, front, back, due_at, state, reps, lapses, scheduled_days, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                deck_id = excluded.deck_id,
                front = excluded.front,
                back = excluded.back,
                due_at = excluded.due_at,
                state = excluded.state,
                reps = excluded.reps,
                lapses = excluded.lapses,
                scheduled_days = excluded.scheduled_days,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at",
            params![
                card.id,
                card.deck_id,
                card.front,
                card.back,
                card.due,
                state_label(card.state),
                card.reps,
                card.lapses,
                card.scheduled_days,
                card.created_at,
                card.updated_at
            ],
        )
        .map_err(|error| error.to_string())?;
    }

    delete_missing_rows(&tx, "cards", "id", remote.cards.iter().map(|card| card.id.as_str()))?;
    delete_missing_rows(&tx, "decks", "id", remote.decks.iter().map(|deck| deck.id.as_str()))?;

    tx.commit().map_err(|error| error.to_string())
}

fn delete_missing_rows<'a, I>(
    connection: &Connection,
    table: &str,
    column: &str,
    ids: I,
) -> Result<(), String>
where
    I: Iterator<Item = &'a str>,
{
    let ids = ids.collect::<Vec<_>>();
    if ids.is_empty() {
        connection
            .execute(&format!("DELETE FROM {}", table), [])
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let placeholders = std::iter::repeat("?")
        .take(ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let query = format!("DELETE FROM {} WHERE {} NOT IN ({})", table, column, placeholders);
    connection
        .execute(&query, params_from_iter(ids))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn get_card(connection: &Connection, card_id: &str) -> Result<Option<CardRow>, String> {
    connection
        .query_row(
            "SELECT c.id, c.deck_id, d.name, c.front, c.back, c.due_at, c.state, c.reps, c.lapses, c.scheduled_days
             FROM cards c
             INNER JOIN decks d ON d.id = c.deck_id
             WHERE c.id = ?",
            [card_id],
            map_card_row,
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn map_card_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardRow> {
    Ok(CardRow {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        deck_name: row.get(2)?,
        front: row.get(3)?,
        back: row.get(4)?,
        due_at: row.get(5)?,
        state: row.get(6)?,
        reps: row.get(7)?,
        lapses: row.get(8)?,
        scheduled_days: row.get(9)?,
    })
}

fn to_review_card(row: CardRow) -> ReviewCard {
    let preview = preview_intervals(&row);
    ReviewCard {
        id: row.id,
        deck_id: row.deck_id,
        deck_name: row.deck_name,
        front: row.front,
        back: row.back,
        due_at: row.due_at,
        state: row.state,
        reps: row.reps,
        lapses: row.lapses,
        scheduled_days: row.scheduled_days,
        preview,
    }
}

fn to_card_snapshot(row: CardRow) -> CardSnapshot {
    CardSnapshot {
        id: row.id,
        deck_id: row.deck_id,
        deck_name: row.deck_name,
        front: row.front,
        back: row.back,
        due_at: row.due_at,
        state: row.state,
        reps: row.reps,
        lapses: row.lapses,
        scheduled_days: row.scheduled_days,
    }
}

fn schedule_card(card: &CardRow, rating: i64) -> Result<CardSnapshot, String> {
    let now = Utc::now();
    let (state, offset, reps_delta, lapses_delta, scheduled_days) = match rating {
        1 => (
            String::from("Relearning"),
            Duration::minutes(1),
            0,
            1,
            0,
        ),
        2 => (
            if card.reps > 0 {
                String::from("Review")
            } else {
                String::from("Learning")
            },
            Duration::minutes(6),
            1,
            0,
            0,
        ),
        3 => (
            if card.reps > 0 {
                String::from("Review")
            } else {
                String::from("Learning")
            },
            if card.reps == 0 {
                Duration::minutes(10)
            } else {
                Duration::days((card.scheduled_days.max(1) * 2) as i64)
            },
            1,
            0,
            if card.reps == 0 {
                0
            } else {
                card.scheduled_days.max(1) * 2
            },
        ),
        4 => (
            String::from("Review"),
            if card.reps == 0 {
                Duration::days(8)
            } else {
                Duration::days((card.scheduled_days.max(2) * 3) as i64)
            },
            1,
            0,
            if card.reps == 0 {
                8
            } else {
                card.scheduled_days.max(2) * 3
            },
        ),
        _ => return Err(String::from("Rating must be 1-4")),
    };

    Ok(CardSnapshot {
        id: card.id.clone(),
        deck_id: card.deck_id.clone(),
        deck_name: card.deck_name.clone(),
        front: card.front.clone(),
        back: card.back.clone(),
        due_at: (now + offset).to_rfc3339(),
        state,
        reps: card.reps + reps_delta,
        lapses: card.lapses + lapses_delta,
        scheduled_days,
    })
}

fn preview_intervals(card: &CardRow) -> Vec<RatingPreview> {
    let format = |value: &str, interval: &str| RatingPreview {
        rating: match value {
            "Again" => 1,
            "Hard" => 2,
            "Good" => 3,
            _ => 4,
        },
        label: match value {
            "Again" => String::from("重来 Again"),
            "Hard" => String::from("困难 Hard"),
            "Good" => String::from("良好 Good"),
            _ => String::from("简单 Easy"),
        },
        interval_label: String::from(interval),
    };

    if card.reps == 0 {
        return vec![
            format("Again", "1 min"),
            format("Hard", "6 mins"),
            format("Good", "10 mins"),
            format("Easy", "8 days"),
        ];
    }

    let hard = (card.scheduled_days.max(1) as f32 * 1.4).round().max(1.0) as i64;
    let good = (card.scheduled_days.max(1) as f32 * 2.0).round().max(2.0) as i64;
    let easy = (card.scheduled_days.max(2) as f32 * 3.0).round().max(4.0) as i64;

    vec![
        format("Again", "1 min"),
        format("Hard", &format_duration(Duration::days(hard))),
        format("Good", &format_duration(Duration::days(good))),
        format("Easy", &format_duration(Duration::days(easy))),
    ]
}

fn format_duration(duration: Duration) -> String {
    let minutes = duration.num_minutes();
    if minutes < 60 {
        return format!("{} min{}", minutes, if minutes == 1 { "" } else { "s" });
    }

    let days = duration.num_days();
    if days < 7 {
        return format!("{} day{}", days, if days == 1 { "" } else { "s" });
    }

    let weeks = ((days as f32) / 7.0).round() as i64;
    format!("{} week{}", weeks, if weeks == 1 { "" } else { "s" })
}

fn compute_streaks(connection: &Connection) -> Result<(i64, i64), String> {
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT substr(reviewed_at, 1, 10) AS day
             FROM review_logs
             ORDER BY day DESC",
        )
        .map_err(|error| error.to_string())?;

    let days = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    if days.is_empty() {
        return Ok((0, 0));
    }

    let parsed = days
        .iter()
        .filter_map(|day| DateTime::parse_from_rfc3339(&format!("{day}T00:00:00+00:00")).ok())
        .map(|date| date.naive_utc().date())
        .collect::<Vec<_>>();

    let today = Utc::now().date_naive();
    let mut current_streak = 0;
    let mut expected = today;

    for day in &parsed {
        if *day == expected {
            current_streak += 1;
            expected -= Duration::days(1);
        } else if *day == today - Duration::days(1) && current_streak == 0 {
            current_streak = 1;
            expected = *day - Duration::days(1);
        } else {
            break;
        }
    }

    let mut longest_streak = 1;
    let mut running = 1;
    for window in parsed.windows(2) {
        if window[0] - window[1] == Duration::days(1) {
            running += 1;
            longest_streak = longest_streak.max(running);
        } else {
            running = 1;
        }
    }

    Ok((current_streak, longest_streak))
}

fn state_label(value: i64) -> &'static str {
    match value {
        0 => "New",
        1 => "Learning",
        2 => "Review",
        3 => "Relearning",
        _ => "New",
    }
}

fn normalize_api_url(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn empty_to_none(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}
