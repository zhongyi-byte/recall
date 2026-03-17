mod store;

use tauri::State;

use store::{
    AppSnapshot, CardSnapshot, CardSummary, DatabaseState, DeleteCardResult, DeleteDeckResult,
    ReviewSession, ReviewUpdate, SyncResult, SyncSettings,
};

#[tauri::command]
fn load_snapshot(state: State<'_, DatabaseState>) -> Result<AppSnapshot, String> {
    store::load_snapshot(&state.path)
}

#[tauri::command]
fn get_sync_settings(state: State<'_, DatabaseState>) -> Result<SyncSettings, String> {
    store::get_sync_settings(&state.path)
}

#[tauri::command]
fn save_sync_settings(
    state: State<'_, DatabaseState>,
    api_url: String,
    api_key: String,
) -> Result<SyncSettings, String> {
    store::save_sync_settings(&state.path, SyncSettings { api_url, api_key })
}

#[tauri::command]
fn sync_now(state: State<'_, DatabaseState>) -> Result<SyncResult, String> {
    store::sync_now(&state.path)
}

#[tauri::command]
fn list_cards(state: State<'_, DatabaseState>, deck_id: String) -> Result<Vec<CardSummary>, String> {
    store::list_cards(&state.path, &deck_id)
}

#[tauri::command]
fn start_review(state: State<'_, DatabaseState>, deck_id: Option<String>) -> Result<ReviewSession, String> {
    store::start_review(&state.path, deck_id.as_deref())
}

#[tauri::command]
fn submit_review(state: State<'_, DatabaseState>, card_id: String, rating: i64) -> Result<ReviewUpdate, String> {
    store::submit_review(&state.path, &card_id, rating)
}

#[tauri::command]
fn undo_review(state: State<'_, DatabaseState>, card: CardSnapshot, log_id: String) -> Result<(), String> {
    store::undo_review(&state.path, card, &log_id)
}

#[tauri::command]
fn delete_card(state: State<'_, DatabaseState>, card_id: String) -> Result<DeleteCardResult, String> {
    store::delete_card(&state.path, &card_id)
}

#[tauri::command]
fn delete_deck(state: State<'_, DatabaseState>, deck_id: String) -> Result<DeleteDeckResult, String> {
    store::delete_deck(&state.path, &deck_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database_state = store::init_database_state().expect("failed to initialize local database");

    tauri::Builder::default()
        .manage(database_state)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_snapshot,
            get_sync_settings,
            save_sync_settings,
            sync_now,
            list_cards,
            start_review,
            submit_review,
            undo_review,
            delete_card,
            delete_deck
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
