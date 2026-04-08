use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

const GITHUB_REPO: &str = "Sadoul/rpwlauncher";
const INSTALLER_ASSET_SUFFIX: &str = "_x64-setup.exe";

/// Standard install path for Tauri currentUser NSIS: %LOCALAPPDATA%\Programs\<productName>
fn get_launcher_exe() -> Option<PathBuf> {
    let candidates = vec![
        dirs::data_local_dir()
            .map(|d| d.join("Programs").join("RPWorld Launcher").join("RPWorld Launcher.exe")),
        dirs::data_local_dir()
            .map(|d| d.join("RPWorld Launcher").join("RPWorld Launcher.exe")),
        // Fallback: same directory as stub
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("RPWorld Launcher.exe"))),
    ];

    for opt in candidates.into_iter().flatten() {
        if opt.exists() {
            return Some(opt);
        }
    }
    None
}

#[tauri::command]
fn check_installed() -> bool {
    get_launcher_exe().is_some()
}

#[tauri::command]
async fn launch_launcher(app: AppHandle) -> Result<(), String> {
    let exe = get_launcher_exe().ok_or("RPWorld Launcher не найден после установки")?;
    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Не удалось запустить: {e}"))?;
    app.exit(0);
    Ok(())
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    percent: u32,
    status: String,
    downloaded: Option<String>,
    speed: Option<String>,
}

#[derive(Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

fn emit_progress(app: &AppHandle, percent: u32, status: &str, downloaded: Option<String>, speed: Option<String>) {
    let _ = app.emit("install-progress", ProgressPayload {
        percent,
        status: status.to_string(),
        downloaded,
        speed,
    });
}

#[tauri::command]
async fn download_and_install(app: AppHandle) -> Result<(), String> {
    emit_progress(&app, 10, "Получение информации о версии...", None, None);

    let client = reqwest::Client::builder()
        .user_agent("RPWorld-Stub/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");
    let release: GithubRelease = client
        .get(&url)
        .send()
        .await
        .map_err(|_| "Не удалось подключиться к GitHub. Проверьте интернет-соединение.")?
        .json()
        .await
        .map_err(|e| format!("Ошибка разбора ответа: {e}"))?;

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(INSTALLER_ASSET_SUFFIX))
        .ok_or("Установщик не найден в последнем релизе")?;

    emit_progress(&app, 15, "Начало загрузки...", None, None);

    let download_url = &asset.browser_download_url;
    let total_size = asset.size;
    let asset_name = &asset.name;

    // Download to temp dir
    let temp_dir = std::env::temp_dir();
    let dest_path = temp_dir.join(asset_name);

    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка загрузки: {e}"))?;

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Не удалось создать файл: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let start_time = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Ошибка загрузки: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Ошибка записи: {e}"))?;
        downloaded += chunk.len() as u64;

        let percent = if total_size > 0 {
            15 + ((downloaded as f64 / total_size as f64) * 70.0) as u32
        } else {
            50
        };

        let elapsed = start_time.elapsed().as_secs_f64();
        let speed = if elapsed > 0.5 {
            let mbs = (downloaded as f64 / elapsed) / (1024.0 * 1024.0);
            Some(format!("{:.1} МБ/с", mbs))
        } else {
            None
        };

        let dl_mb = downloaded as f64 / (1024.0 * 1024.0);
        let total_mb = total_size as f64 / (1024.0 * 1024.0);
        let dl_str = if total_size > 0 {
            Some(format!("{:.1} / {:.1} МБ", dl_mb, total_mb))
        } else {
            Some(format!("{:.1} МБ", dl_mb))
        };

        emit_progress(
            &app,
            percent.min(85),
            "Загрузка RPWorld Launcher...",
            dl_str,
            speed,
        );
    }

    drop(file);

    emit_progress(&app, 87, "Запуск установщика...", None, None);

    // Run NSIS installer silently
    let status = std::process::Command::new(&dest_path)
        .args(["/S"])
        .status()
        .map_err(|e| format!("Не удалось запустить установщик: {e}"))?;

    // Clean up temp installer
    let _ = std::fs::remove_file(&dest_path);

    if !status.success() {
        return Err(format!(
            "Установщик завершился с ошибкой: {}",
            status.code().unwrap_or(-1)
        ));
    }

    emit_progress(&app, 97, "Установка завершена!", None, None);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_installed,
            launch_launcher,
            download_and_install
        ])
        .run(tauri::generate_context!())
        .expect("error running stub");
}
