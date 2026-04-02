use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use std::{fs, thread};

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebouncedEvent, DebounceEventResult};
use tauri::{AppHandle, Emitter};

use crate::commands::AppState;

/// 在后台线程启动文件系统监听，将变化以 Tauri 事件发送给前端
///
/// 事件名称：`fs:created` / `fs:changed` / `fs:deleted`
/// 通过文件是否存在来区分 created / changed / deleted。
pub fn start_watcher(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || {
        let data_dir = state.data_dir.lock().unwrap().clone();

        let app_handle = app.clone();
        let state_ref = Arc::clone(&state);

        let (tx, rx) = std::sync::mpsc::channel::<DebounceEventResult>();

        let mut debouncer = match new_debouncer(
            std::time::Duration::from_millis(300),
            tx,
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Inner watcher] Failed to create debouncer: {e}");
                return;
            }
        };

        if let Err(e) = debouncer.watcher().watch(&data_dir, RecursiveMode::Recursive) {
            eprintln!("[Inner watcher] Failed to watch {:?}: {e}", data_dir);
            return;
        }

        eprintln!("[Inner watcher] Watching {:?}", data_dir);

        // 记录已知文件，用于区分 created / changed
        let mut known_files: HashSet<String> = HashSet::new();
        if let Ok(entries) = fs::read_dir(&data_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Ok(r) = p.strip_prefix(&data_dir) {
                        known_files.insert(r.to_string_lossy().replace('\\', "/"));
                    }
                }
            }
        }

        for result in rx {
            let events: Vec<DebouncedEvent> = match result {
                Ok(evs) => evs,
                Err(e) => {
                    eprintln!("[Inner watcher] Error: {e}");
                    continue;
                }
            };

            for event in events {
                let path: PathBuf = event.path;

                if path.extension().and_then(|s| s.to_str()) != Some("md") {
                    continue;
                }

                let rel = match path.strip_prefix(&data_dir) {
                    Ok(r) => r.to_string_lossy().replace('\\', "/"),
                    Err(_) => continue,
                };

                // 如果是 App 自己写入的，跳过（防回显）
                {
                    let rw = state_ref.recent_writes.lock().unwrap();
                    if rw.contains(&rel) {
                        continue;
                    }
                }

                if path.exists() {
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    let last_modified = fs::metadata(&path)
                        .ok()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);

                    if known_files.contains(&rel) {
                        app_handle
                            .emit("fs:changed", serde_json::json!({ "name": rel, "content": content, "lastModified": last_modified }))
                            .ok();
                    } else {
                        known_files.insert(rel.clone());
                        app_handle
                            .emit("fs:created", serde_json::json!({ "name": rel, "content": content, "lastModified": last_modified }))
                            .ok();
                    }
                } else {
                    known_files.remove(&rel);
                    app_handle
                        .emit("fs:deleted", serde_json::json!({ "name": rel }))
                        .ok();
                }
            }
        }
    });
}
