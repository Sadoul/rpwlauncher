use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".rpworld")
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

/// Copy the chosen image file into %APPDATA%/.rpworld/avatar.<ext>
/// Returns a tauri asset URL that can be used as <img src="...">
#[tauri::command]
pub async fn save_avatar(source_path: String, app: AppHandle) -> Result<String, String> {
    let src = PathBuf::from(&source_path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();

    let dest_dir = data_dir();
    fs::create_dir_all(&dest_dir).map_err(|e| format!("Не удалось создать папку: {e}"))?;

    let dest = dest_dir.join(format!("avatar.{ext}"));
    fs::copy(&src, &dest).map_err(|e| format!("Не удалось скопировать аватарку: {e}"))?;

    // Return convertFileSrc-compatible path — use tauri asset protocol
    let path_str = dest.to_string_lossy().replace('\\', "/");
    Ok(format!("asset://localhost/{}", urlencoding::encode(&path_str)))
}

/// Return the saved avatar URL (if exists)
#[tauri::command]
pub fn get_avatar() -> Option<String> {
    let base = data_dir();
    for ext in ["gif", "webp", "png", "jpg", "jpeg"] {
        let p = base.join(format!("avatar.{ext}"));
        if p.exists() {
            let path_str = p.to_string_lossy().replace('\\', "/");
            return Some(format!("asset://localhost/{}", urlencoding::encode(&path_str)));
        }
    }
    None
}

// ─── Open data folder in Explorer ───���────────────────────────────────────────

#[tauri::command]
pub fn open_data_folder() -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).ok();

    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(dir.to_str().unwrap_or("."))
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir.to_str().unwrap_or("."))
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(dir.to_str().unwrap_or("."))
            .spawn()
            .map_err(|e| format!("Не удалось открыть папку: {e}"))?;
    }

    Ok(())
}

// ─── Delete launcher ──────────────────────────────────────────────────────────

/// Uninstall via NSIS uninstaller from registry, then exit.
#[tauri::command]
pub async fn delete_launcher(app: AppHandle) -> Result<(), String> {
    // First, remove data directory
    let dir = data_dir();
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Не удалось удалить данные: {e}"))?;
    }

    // Try to find and run NSIS uninstaller
    #[cfg(windows)]
    {
        let uninstall_keys = [
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rpworld.launcher_is1",
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher_is1",
        ];

        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for key_path in &uninstall_keys {
            if let Ok(key) = hkcu.open_subkey(key_path) {
                if let Ok(uninstall_str) = key.get_value::<String, _>("UninstallString") {
                    // Run uninstaller silently
                    let _ = std::process::Command::new(&uninstall_str)
                        .args(["/S"])
                        .spawn();
                    break;
                }
            }
        }
    }

    // Exit the launcher
    app.exit(0);
    Ok(())
}
