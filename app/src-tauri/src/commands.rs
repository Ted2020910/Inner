use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;
use std::{fs, io};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

// ── 共享状态 ──────────────────────────────────────────────────────────────────

pub struct AppState {
    /// 当前数据目录（可被用户切换）
    pub data_dir: Arc<Mutex<PathBuf>>,
    /// 最近由 App 自身写入的文件名集合，用于屏蔽 watcher 回显
    pub recent_writes: Arc<Mutex<std::collections::HashSet<String>>>,
}

// ── 数据模型 ──────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub content: String,
    #[serde(rename = "lastModified")]
    pub last_modified: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMeta {
    pub name: String,
    #[serde(rename = "lastModified")]
    pub last_modified: u64,
}

// ── 路径工具 ──────────────────────────────────────────────────────────────────

/// 将相对名称解析为安全的绝对路径（防止路径穿越）
fn safe_path(data_dir: &Path, name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.contains("..") {
        return None;
    }
    // 统一用 `/` 分隔，转换为操作系统路径
    let rel: PathBuf = name.replace('\\', "/").split('/').filter(|s| !s.is_empty()).collect();
    let abs = data_dir.join(&rel);
    // 确保最终路径仍在 data_dir 内部
    if abs.starts_with(data_dir) {
        Some(abs)
    } else {
        None
    }
}

/// 给文件名补全 `.md` 后缀（如果还没有的话）
fn ensure_md(name: &str) -> String {
    if name.to_lowercase().ends_with(".md") {
        name.to_owned()
    } else {
        format!("{}.md", name)
    }
}

/// 递归列举目录下所有 `.md` 文件，返回相对于 `root` 的路径
fn walk_md(root: &Path) -> Vec<PathBuf> {
    let mut results = Vec::new();
    if let Ok(entries) = walkdir::WalkDir::new(root)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| Ok::<_, io::Error>(e))
        .collect::<Result<Vec<_>, _>>()
    {
        for entry in entries {
            let p = entry.path();
            if p.extension().and_then(|s| s.to_str()) == Some("md") {
                results.push(p.to_path_buf());
            }
        }
    }
    results
}

fn file_meta(root: &Path, abs: &Path) -> Option<FileMeta> {
    let stat = fs::metadata(abs).ok()?;
    let last_modified = stat
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let rel = abs.strip_prefix(root).ok()?;
    let name = rel.to_string_lossy().replace('\\', "/");
    Some(FileMeta { name, last_modified })
}

// ── Tauri 命令 ────────────────────────────────────────────────────────────────

/// 列出数据目录下所有 `.md` 文件（按最后修改时间倒序）
#[tauri::command]
pub fn list_files(state: State<'_, AppState>) -> Vec<FileMeta> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let mut files: Vec<FileMeta> = walk_md(&data_dir)
        .iter()
        .filter_map(|p| file_meta(&data_dir, p))
        .collect();
    files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    files
}

/// 读取单个文件内容
#[tauri::command]
pub fn read_file(name: String, state: State<'_, AppState>) -> Result<FileInfo, String> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let name = ensure_md(&name);
    let path = safe_path(&data_dir, &name).ok_or("Invalid filename")?;

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let stat = fs::metadata(&path).map_err(|e| e.to_string())?;
    let last_modified = stat
        .modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;

    Ok(FileInfo { name, content, last_modified })
}

/// 写入（覆盖）文件，自动创建父目录
#[tauri::command]
pub fn write_file(name: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let name = ensure_md(&name);
    let path = safe_path(&data_dir, &name).ok_or("Invalid filename")?;

    // 标记为"最近写入"，让 watcher 跳过此事件
    {
        let mut rw = state.recent_writes.lock().unwrap();
        rw.insert(name.clone());
    }
    let state_clone_rw = Arc::clone(&state.recent_writes);
    let name_clone = name.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1200));
        state_clone_rw.lock().unwrap().remove(&name_clone);
    });

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

/// 删除文件
#[tauri::command]
pub fn delete_file(name: String, state: State<'_, AppState>) -> Result<(), String> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let name = ensure_md(&name);
    let path = safe_path(&data_dir, &name).ok_or("Invalid filename")?;

    {
        let mut rw = state.recent_writes.lock().unwrap();
        rw.insert(name.clone());
    }
    let state_clone_rw = Arc::clone(&state.recent_writes);
    let name_clone = name.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1200));
        state_clone_rw.lock().unwrap().remove(&name_clone);
    });

    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 重命名文件
#[tauri::command]
pub fn rename_file(from: String, to: String, state: State<'_, AppState>) -> Result<(), String> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let from = ensure_md(&from);
    let to = ensure_md(&to);
    let src = safe_path(&data_dir, &from).ok_or("Invalid source filename")?;
    let dst = safe_path(&data_dir, &to).ok_or("Invalid destination filename")?;

    {
        let mut rw = state.recent_writes.lock().unwrap();
        rw.insert(from.clone());
        rw.insert(to.clone());
    }
    let state_clone_rw = Arc::clone(&state.recent_writes);
    let from_clone = from.clone();
    let to_clone = to.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(1200));
        let mut rw = state_clone_rw.lock().unwrap();
        rw.remove(&from_clone);
        rw.remove(&to_clone);
    });

    if let Some(dir) = dst.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    Ok(())
}

/// 全文搜索（文件名 + 内容）
#[tauri::command]
pub fn search_files(query: String, state: State<'_, AppState>) -> Vec<FileInfo> {
    let data_dir = state.data_dir.lock().unwrap().clone();
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return vec![];
    }

    let mut results: Vec<FileInfo> = walk_md(&data_dir)
        .iter()
        .filter_map(|p| {
            let meta = file_meta(&data_dir, p)?;
            let content = fs::read_to_string(p).unwrap_or_default();
            if meta.name.to_lowercase().contains(&q) || content.to_lowercase().contains(&q) {
                Some(FileInfo {
                    name: meta.name,
                    content,
                    last_modified: meta.last_modified,
                })
            } else {
                None
            }
        })
        .collect();

    results.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));
    results
}

/// 返回当前数据目录路径（供前端显示）
#[tauri::command]
pub fn get_data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.lock().unwrap().to_string_lossy().into_owned()
}

/// 切换数据目录（用户通过原生对话框选择文件夹后调用）
#[tauri::command]
pub fn set_data_dir(path: String, state: State<'_, AppState>, app: AppHandle) -> Result<String, String> {
    let new_dir = PathBuf::from(&path);
    if !new_dir.is_dir() {
        return Err(format!("路径不是有效目录: {}", path));
    }
    {
        let mut data_dir = state.data_dir.lock().unwrap();
        *data_dir = new_dir.clone();
    }
    // 重启 watcher（通知前端刷新）
    app.emit("fs:dir-changed", path.clone()).ok();
    Ok(path)
}
