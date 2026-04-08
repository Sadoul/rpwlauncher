use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: String,    // URL голого .exe для быстрого обновления
    pub installer_url: String,   // URL NSIS установщика (для stub при первой установке)
    pub release_notes: String,
    pub file_size: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateProgress {
    pub stage: String,        // "checking" | "downloading" | "applying" | "done" | "error"
    pub downloaded: u64,
    pub total: u64,
    pub speed_kb: u64,        // KB/s
    pub message: String,
}

const GITHUB_REPO: &str = "Sadoul/rpwlauncher";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |v: &str| {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect::<Vec<_>>()
    };
    parse(a).cmp(&parse(b))
}

#[tauri::command]
pub async fn check_launcher_update() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher/1.0")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let api_url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let response = client
        .get(&api_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {}", e))?;

    if !response.status().is_success() {
        return Ok(UpdateInfo {
            current_version: CURRENT_VERSION.to_string(),
            latest_version: CURRENT_VERSION.to_string(),
            update_available: false,
            download_url: String::new(),
            installer_url: String::new(),
            release_notes: String::new(),
            file_size: 0,
        });
    }

    let release: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let tag = release["tag_name"].as_str().unwrap_or(CURRENT_VERSION).to_string();
    let latest_clean = tag.trim_start_matches('v').to_string();

    let assets = release["assets"].as_array().cloned().unwrap_or_default();

    // Find bare exe (just the app binary, no installer) — fastest download
    let mut download_url = String::new();
    let mut installer_url = String::new();
    let mut file_size: u64 = 0;

    for asset in &assets {
        let name = asset["name"].as_str().unwrap_or("");
        let url = asset["browser_download_url"].as_str().unwrap_or("").to_string();
        let size = asset["size"].as_u64().unwrap_or(0);

        // Bare exe for fast updates (published as RPWorld-Launcher-app.exe)
        if name == "RPWorld-Launcher-app.exe" {
            download_url = url.clone();
            file_size = size;
        }
        // NSIS installer as fallback
        if name.ends_with("_x64-setup.exe") && !name.contains("debug") {
            installer_url = url.clone();
            if download_url.is_empty() {
                file_size = size;
            }
        }
    }

    // If no bare exe, fall back to NSIS installer URL for update too
    if download_url.is_empty() {
        download_url = installer_url.clone();
    }

    let release_notes = release["body"].as_str().unwrap_or("").to_string();
    let update_available = !download_url.is_empty()
        && compare_versions(&latest_clean, CURRENT_VERSION) == std::cmp::Ordering::Greater;

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest_clean,
        update_available,
        download_url,
        installer_url,
        release_notes,
        file_size,
    })
}

#[tauri::command]
pub async fn update_launcher(app: tauri::AppHandle) -> Result<String, String> {
    let info = check_launcher_update().await?;

    if !info.update_available {
        return Ok("no_update".to_string());
    }

    let emit = |stage: &str, downloaded: u64, total: u64, speed: u64, msg: &str| {
        let _ = app.emit("update-progress", UpdateProgress {
            stage: stage.to_string(),
            downloaded,
            total,
            speed_kb: speed,
            message: msg.to_string(),
        });
    };

    emit("downloading", 0, info.file_size, 0, "Начало скачивания...");

    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&info.download_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка скачивания: {}", e))?;

    let total = response.content_length().unwrap_or(info.file_size);
    let temp_dir = std::env::temp_dir();
    let is_bare_exe = info.download_url.ends_with("RPWorld-Launcher-app.exe");

    let dl_filename = if is_bare_exe {
        format!("rpw-app-{}.exe", info.latest_version)
    } else {
        format!("rpw-setup-{}.exe", info.latest_version)
    };
    let download_path = temp_dir.join(&dl_filename);

    // Stream download with progress
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut file = fs::File::create(&download_path).map_err(|e| e.to_string())?;
    let start_time = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let elapsed = start_time.elapsed().as_secs_f64();
        let speed_kb = if elapsed > 0.0 {
            (downloaded as f64 / elapsed / 1024.0) as u64
        } else {
            0
        };

        let mb_done = downloaded as f64 / 1_048_576.0;
        let mb_total = total as f64 / 1_048_576.0;
        let msg = format!("Скачивание... {:.1}/{:.1} МБ", mb_done, mb_total);
        emit("downloading", downloaded, total, speed_kb, &msg);
    }
    drop(file);

    emit("applying", total, total, 0, "Применение обновления...");

    if is_bare_exe {
        // Optimized update: just replace the exe file
        apply_exe_update(&app, &download_path, &info.latest_version)?;
    } else {
        // Fallback: run NSIS installer silently via batch script
        apply_nsis_update(&app, &download_path)?;
    }

    Ok("update_started".to_string())
}

/// Fast update: replace only the main exe binary (no NSIS, no registry changes)
fn apply_exe_update(app: &tauri::AppHandle, new_exe: &PathBuf, version: &str) -> Result<(), String> {
    let current_exe = std::env::current_exe()
        .map_err(|e| e.to_string())?;

    let current_dir = current_exe.parent()
        .ok_or("Cannot get exe directory")?;

    // Copy new exe next to current one (as _new.exe)
    let new_target = current_dir.join("RPWorld Launcher_new.exe");
    fs::copy(new_exe, &new_target).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(new_exe);

    let install_path = current_exe.to_string_lossy().to_string();
    let new_path = new_target.to_string_lossy().to_string();

    // Write batch: wait → rename new over old → launch new
    let batch_path = std::env::temp_dir().join("rpw_apply_update.bat");
    let batch = format!(
        "@echo off\r\n\
        timeout /t 2 /nobreak >nul\r\n\
        move /y \"{new}\" \"{current}\"\r\n\
        timeout /t 1 /nobreak >nul\r\n\
        start \"\" \"{current}\"\r\n\
        del \"%~f0\"\r\n",
        new = new_path,
        current = install_path,
    );

    {
        let mut f = fs::File::create(&batch_path).map_err(|e| e.to_string())?;
        f.write_all(batch.as_bytes()).map_err(|e| e.to_string())?;
    }

    Command::new("cmd")
        .args(["/c", "start", "/min", "", batch_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("Не удалось запустить обновление: {}", e))?;

    tokio::runtime::Handle::current().spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        app.exit(0);
    });

    Ok(())
}

/// Fallback: run NSIS installer silently
fn apply_nsis_update(app: &tauri::AppHandle, installer: &PathBuf) -> Result<(), String> {
    let installer_str = installer.to_string_lossy().to_string();
    let install_dir = dirs::data_local_dir()
        .unwrap_or_default()
        .join("Programs")
        .join("RPWorld Launcher")
        .join("RPWorld Launcher.exe");
    let launch_path = install_dir.to_string_lossy().to_string();

    let batch_path = std::env::temp_dir().join("rpw_nsis_update.bat");
    let batch = format!(
        "@echo off\r\n\
        timeout /t 2 /nobreak >nul\r\n\
        \"{installer}\" /S\r\n\
        timeout /t 4 /nobreak >nul\r\n\
        if exist \"{launcher}\" start \"\" \"{launcher}\"\r\n\
        del \"{installer}\"\r\n\
        del \"%~f0\"\r\n",
        installer = installer_str,
        launcher = launch_path,
    );

    {
        let mut f = fs::File::create(&batch_path).map_err(|e| e.to_string())?;
        f.write_all(batch.as_bytes()).map_err(|e| e.to_string())?;
    }

    Command::new("cmd")
        .args(["/c", "start", "/min", "", batch_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("Не удалось запустить установщик: {}", e))?;

    tokio::runtime::Handle::current().spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
        app.exit(0);
    });

    Ok(())
}
