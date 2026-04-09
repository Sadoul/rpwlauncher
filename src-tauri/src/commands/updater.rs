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
    pub download_url: String,
    pub installer_url: String,
    pub release_notes: String,
    pub file_size: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UpdateProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: u64,
    pub speed_kb: u64,
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

/// Find the installed launcher exe using registry (same logic as stub)
fn find_installed_exe() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher",
        ) {
            if let Ok(raw) = key.get_value::<String, _>("InstallLocation") {
                let dir = raw.trim_matches('"');
                let exe = PathBuf::from(dir).join("rpw-launcher.exe");
                if exe.exists() {
                    return Some(exe);
                }
            }
        }
    }

    // Fallback: default Tauri NSIS path — %LOCALAPPDATA%\RPWorld Launcher\rpw-launcher.exe
    let candidates = [
        dirs::data_local_dir().map(|d| d.join("RPWorld Launcher").join("rpw-launcher.exe")),
        dirs::data_local_dir()
            .map(|d| d.join("Programs").join("RPWorld Launcher").join("rpw-launcher.exe")),
    ];
    for c in candidates.into_iter().flatten() {
        if c.exists() {
            return Some(c);
        }
    }
    None
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
    let tag = release["tag_name"]
        .as_str()
        .unwrap_or(CURRENT_VERSION)
        .to_string();
    let latest_clean = tag.trim_start_matches('v').to_string();

    let assets = release["assets"].as_array().cloned().unwrap_or_default();

    let mut installer_url = String::new();
    let mut file_size: u64 = 0;

    for asset in &assets {
        let name = asset["name"].as_str().unwrap_or("");
        let url = asset["browser_download_url"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let size = asset["size"].as_u64().unwrap_or(0);

        // Only use the NSIS setup installer (most reliable — full re-install)
        if name.ends_with("_x64-setup.exe") && !name.contains("debug") {
            installer_url = url.clone();
            file_size = size;
        }
    }

    let release_notes = release["body"].as_str().unwrap_or("").to_string();
    let update_available = !installer_url.is_empty()
        && compare_versions(&latest_clean, CURRENT_VERSION) == std::cmp::Ordering::Greater;

    Ok(UpdateInfo {
        current_version: CURRENT_VERSION.to_string(),
        latest_version: latest_clean,
        update_available,
        download_url: installer_url.clone(),
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

    let app_ref = app.clone();
    let emit = move |stage: &str, downloaded: u64, total: u64, speed: u64, msg: &str| {
        let _ = app_ref.emit(
            "update-progress",
            UpdateProgress {
                stage: stage.to_string(),
                downloaded,
                total,
                speed_kb: speed,
                message: msg.to_string(),
            },
        );
    };

    emit("downloading", 0, info.file_size, 0, "Начало скачивания...");

    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&info.installer_url)
        .send()
        .await
        .map_err(|e| format!("Ошибка скачивания: {}", e))?;

    let total = response.content_length().unwrap_or(info.file_size);
    let temp_dir = std::env::temp_dir();
    let download_path = temp_dir.join(format!("rpw-setup-{}.exe", info.latest_version));

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
        let speed_kb = if elapsed > 0.1 {
            (downloaded as f64 / elapsed / 1024.0) as u64
        } else {
            0
        };

        let mb_done = downloaded as f64 / 1_048_576.0;
        let mb_total = total as f64 / 1_048_576.0;
        emit(
            "downloading",
            downloaded,
            total,
            speed_kb,
            &format!("Скачивание... {:.1}/{:.1} МБ", mb_done, mb_total),
        );
    }
    drop(file);

    emit("applying", total, total, 0, "Установка обновления...");

    apply_nsis_update(app, &download_path)?;

    Ok("update_started".to_string())
}

/// Apply update via NSIS silent installer.
/// Uses registry to find correct launch path after install.
fn apply_nsis_update(app: tauri::AppHandle, installer: &PathBuf) -> Result<(), String> {
    let installer_str = installer.to_string_lossy().to_string();

    // Determine where the launcher will be after NSIS installs.
    // Tauri NSIS currentUser mode → %LOCALAPPDATA%\RPWorld Launcher\rpw-launcher.exe
    let launch_path = find_installed_exe()
        .unwrap_or_else(|| {
            dirs::data_local_dir()
                .unwrap_or_default()
                .join("RPWorld Launcher")
                .join("rpw-launcher.exe")
        })
        .to_string_lossy()
        .to_string();

    let batch_path = std::env::temp_dir().join("rpw_nsis_update.bat");

    // Batch script:
    //  1. wait 3 s (let the current process fully exit)
    //  2. run NSIS installer silently
    //  3. wait 5 s (NSIS can take a moment)
    //  4. launch the freshly-installed exe
    //  5. self-delete
    let batch = format!(
        "@echo off\r\n\
         timeout /t 3 /nobreak >nul\r\n\
         \"{installer}\" /S\r\n\
         timeout /t 5 /nobreak >nul\r\n\
         if exist \"{launcher}\" (\r\n\
           start \"\" \"{launcher}\"\r\n\
         ) else (\r\n\
           rem fallback: try Programs subfolder\r\n\
           set FB=%LOCALAPPDATA%\\Programs\\RPWorld Launcher\\rpw-launcher.exe\r\n\
           if exist \"%FB%\" start \"\" \"%FB%\"\r\n\
         )\r\n\
         del \"{installer}\"\r\n\
         del \"%~f0\"\r\n",
        installer = installer_str,
        launcher = launch_path,
    );

    fs::write(&batch_path, batch.as_bytes()).map_err(|e| e.to_string())?;

    Command::new("cmd")
        .args(["/c", "start", "/min", "", batch_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| e.to_string())?;

    // Give the batch a head-start, then close the app
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        app.exit(0);
    });

    Ok(())
}
