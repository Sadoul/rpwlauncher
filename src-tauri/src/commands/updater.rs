use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: String,
    pub release_notes: String,
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
            release_notes: String::new(),
        });
    }

    let release: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let tag = release["tag_name"]
        .as_str()
        .unwrap_or(CURRENT_VERSION)
        .to_string();
    let latest_clean = tag.trim_start_matches('v').to_string();

    let download_url = release["assets"]
        .as_array()
        .and_then(|assets| {
            assets.iter().find_map(|a| {
                let name = a["name"].as_str().unwrap_or("");
                if (name.ends_with("_x64-setup.exe") || name.ends_with("-setup.exe"))
                    && !name.contains("debug")
                {
                    a["browser_download_url"].as_str().map(|s| s.to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_default();

    let release_notes = release["body"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let update_available = !download_url.is_empty()
        && compare_versions(&latest_clean, CURRENT_VERSION) == std::cmp::Ordering::Greater;

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest_clean,
        update_available,
        download_url,
        release_notes,
    })
}

#[tauri::command]
pub async fn update_launcher(app: tauri::AppHandle) -> Result<String, String> {
    let info = check_launcher_update().await?;

    if !info.update_available {
        return Ok("Нет доступных обновлений".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&info.download_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка скачивания: {}", e))?;

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(format!("rpw-update-{}.exe", info.latest_version));
    fs::write(&installer_path, &bytes).map_err(|e| e.to_string())?;

    // Write a small batch script that:
    // 1. Waits for the launcher process to exit
    // 2. Runs the installer silently
    // 3. Launches the newly installed launcher
    let launcher_exe = std::env::current_exe()
        .unwrap_or_else(|_| PathBuf::from("RPWorld Launcher.exe"));

    let install_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Programs")
        .join("RPWorld Launcher")
        .join("RPWorld Launcher.exe");

    let batch_path = temp_dir.join("rpw_update.bat");
    let batch_content = format!(
        "@echo off\r\n\
        timeout /t 2 /nobreak >nul\r\n\
        taskkill /f /im \"RPWorld Launcher.exe\" >nul 2>&1\r\n\
        timeout /t 1 /nobreak >nul\r\n\
        \"{installer}\" /S\r\n\
        timeout /t 5 /nobreak >nul\r\n\
        if exist \"{launcher}\" start \"\" \"{launcher}\"\r\n\
        del \"%~f0\"\r\n",
        installer = installer_path.to_string_lossy(),
        launcher = install_dir.to_string_lossy(),
    );

    {
        let mut f = fs::File::create(&batch_path).map_err(|e| e.to_string())?;
        f.write_all(batch_content.as_bytes()).map_err(|e| e.to_string())?;
    }

    // Run the batch in background and exit the app
    Command::new("cmd")
        .args(["/c", "start", "/min", "", batch_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("Не удалось запустить обновление: {}", e))?;

    // Give the batch a moment to start, then close the app
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    app.exit(0);

    Ok("update_started".to_string())
}
