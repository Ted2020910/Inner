mod commands;
mod watcher;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use commands::AppState;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // ── 确定数据目录 ──────────────────────────────────────────────
            let data_dir: PathBuf = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory")
                .join("data");

            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir)
                    .expect("Failed to create data directory");
            }

            // ── 构建共享状态 ──────────────────────────────────────────────
            let state = Arc::new(AppState {
                data_dir: Arc::new(Mutex::new(data_dir)),
                recent_writes: Arc::new(Mutex::new(HashSet::new())),
            });

            app.manage(AppState {
                data_dir: Arc::clone(&state.data_dir),
                recent_writes: Arc::clone(&state.recent_writes),
            });

            // ── 启动文件监听 ──────────────────────────────────────────────
            watcher::start_watcher(app.handle().clone(), Arc::clone(&state));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_files,
            commands::read_file,
            commands::write_file,
            commands::delete_file,
            commands::rename_file,
            commands::search_files,
            commands::get_data_dir,
            commands::set_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
