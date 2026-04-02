use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use std::{fs, thread};

use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode, DebouncedEvent};
use tauri::{AppHandle, Manager};

use crate::commands::AppState;

/// 在后台线程启动文件系统监听，将变化以 Tauri 事件发送给前端
///
/// 事件名称与原 WebSocket 协议一致（`fs:created` / `fs:changed` / `fs:deleted`），
/// 前端只需把 `ws.onmessage` 换成 `listen()` 即可。
pub fn start_watcher(app: AppHandle, state: Arc<AppState>) {
    thread::spawn(move || {
        // 拿一份初始 data_dir 的 clone，监听期间不再动态更换
        let data_dir = state.data_dir.lock().unwrap().clone();

        let app_handle = app.clone();
        let state_ref = Arc::clone(&state);

        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<DebouncedEvent>, Vec<notify::Error>>>();

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

        for result in rx {
            let events = match result {
                Ok(evs) => evs,
                Err(errs) => {
                    for e in errs {
                        eprintln!("[Inner watcher] Error: {e}");
                    }
                    continue;
                }
            };

            for event in events {
                let path: PathBuf = event.path;

                // 只关心 .md 文件
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

                use notify_debouncer_mini::notify::EventKind;
                match event.kind {
                    EventKind::Create(_) => {
                        let content = fs::read_to_string(&path).unwrap_or_default();
                        let last_modified = fs::metadata(&path)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(0);
                        app_handle
                            .emit("fs:created", serde_json::json!({ "name": rel, "content": content, "lastModified": last_modified }))
                            .ok();
                    }
                    EventKind::Modify(_) => {
                        let content = fs::read_to_string(&path).unwrap_or_default();
                        let last_modified = fs::metadata(&path)
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as u64)
                            .unwrap_or(0);
                        app_handle
                            .emit("fs:changed", serde_json::json!({ "name": rel, "content": content, "lastModified": last_modified }))
                            .ok();
                    }
                    EventKind::Remove(_) => {
                        app_handle
                            .emit("fs:deleted", serde_json::json!({ "name": rel }))
                            .ok();
                    }
                    _ => {}
                }
            }
        }
    });
}
