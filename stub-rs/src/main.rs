//! RPWorld Launcher Stub
//! Tiny Windows executable (~400 KB) that:
//!   1. Checks GitHub for the latest release version
//!   2. If installed version is outdated (or not installed) → downloads NSIS installer silently
//!   3. Launches the (freshly) installed launcher
//!
//! This makes auto-update work even for users who have a very old version installed,
//! because the stub itself handles the update — it never relies on the old launcher's code.
//!
//! No Tauri, no WebView → compiles in ~60-90 seconds.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod token;
use token::GITHUB_TOKEN;

use std::path::PathBuf;
use std::process::{Command, exit};

#[derive(serde::Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(serde::Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

const GITHUB_REPO: &str = "Sadoul/rpwlauncher";
const EXE_NAME:    &str = "rpw-launcher.exe";
const INSTALL_DIR: &str = "RPWorld Launcher";
const REG_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher";

fn main() {
    let client = match reqwest::blocking::Client::builder()
        .user_agent("RPWorld-Stub/3.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            // No HTTP client → just launch whatever is installed
            if let Some(path) = find_launcher() {
                let _ = Command::new(&path).spawn();
            }
            exit(0);
        }
    };

    // ── 1. Fetch latest release info from GitHub ──────────────────────────────
    let api_url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let release: GitHubRelease = match client
        .get(&api_url)
        .header("Authorization", format!("Bearer {}", GITHUB_TOKEN))
        .send()
        .and_then(|r| r.json())
    {
        Ok(r) => r,
        Err(_) => {
            // Can't reach GitHub → just launch whatever is installed
            if let Some(path) = find_launcher() {
                let _ = Command::new(&path).spawn();
            }
            exit(0);
        }
    };

    let latest_version = release.tag_name.trim_start_matches('v').to_string();

    // ── 2. Check installed version ─────────────────────────────────────────────
    let installed_version = get_installed_version();
    let launcher_path = find_launcher();

    let needs_update = match &installed_version {
        Some(installed) => compare_versions(&latest_version, installed) == std::cmp::Ordering::Greater,
        None => true, // not installed at all
    };

    if !needs_update {
        // Already up to date — just launch
        if let Some(path) = launcher_path {
            let _ = Command::new(&path).spawn();
        }
        exit(0);
    }

    // ── 3. Find NSIS setup installer in release assets ────────────────────────
    let asset = release
        .assets
        .iter()
        .find(|a| {
            let n = a.name.to_lowercase();
            (n.contains("setup") || n.contains("x64")) && n.ends_with(".exe")
                && !n.contains("rpworld-launcher") // exclude stub itself
        });

    let asset = match asset {
        Some(a) => a,
        None => {
            // No installer asset found → just launch if installed
            if let Some(path) = launcher_path {
                let _ = Command::new(&path).spawn();
            }
            exit(0);
        }
    };

    // ── 4. Show notification only on first install (no previous version) ──────
    if installed_version.is_none() {
        #[cfg(windows)]
        unsafe {
            use std::ffi::OsStr;
            use std::os::windows::ffi::OsStrExt;
            let msg: Vec<u16> = OsStr::new(
                "RPWorld Launcher не установлен.\n\
                 Сейчас будет скачан и установлен автоматически.\n\n\
                 Нажмите OK чтобы продолжить.",
            )
            .encode_wide()
            .chain(Some(0))
            .collect();
            let caption: Vec<u16> = OsStr::new("RPWorld Launcher")
                .encode_wide()
                .chain(Some(0))
                .collect();
            windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
                0,
                msg.as_ptr(),
                caption.as_ptr(),
                windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                    | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONINFORMATION,
            );
        }
    }

    // ── 5. Download installer ──────────────────────────────────────────────────
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(&asset.name);

    let bytes = match client
        .get(&asset.browser_download_url)
        .header("Authorization", format!("Bearer {}", GITHUB_TOKEN))
        .send()
        .and_then(|r| r.bytes())
    {
        Ok(b) => b,
        Err(_) => {
            show_error("Ошибка скачивания обновления. Проверьте интернет-соединение.");
            // Fallback: launch old version if available
            if let Some(path) = launcher_path {
                let _ = Command::new(&path).spawn();
            }
            exit(0);
        }
    };

    if std::fs::write(&installer_path, &bytes).is_err() {
        show_error("Ошибка сохранения файла обновления.");
        if let Some(path) = launcher_path {
            let _ = Command::new(&path).spawn();
        }
        exit(0);
    }

    // ── 6. Run NSIS installer silently ────────────────────────────────────────
    let status = Command::new(&installer_path)
        .args(["/S"])
        .spawn()
        .and_then(|mut c| c.wait());

    let _ = std::fs::remove_file(&installer_path);

    // ── 7. Wait for NSIS to finish, then launch ───────────────────────────────
    let wait_ms = if status.is_ok() { 3000 } else { 1000 };
    std::thread::sleep(std::time::Duration::from_millis(wait_ms));

    if let Some(path) = find_launcher() {
        let _ = Command::new(&path).spawn();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Read installed version from NSIS registry (DisplayVersion field).
fn get_installed_version() -> Option<String> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(REG_KEY) {
            if let Ok(ver) = key.get_value::<String, _>("DisplayVersion") {
                let v = ver.trim().trim_start_matches('v').to_string();
                if !v.is_empty() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Find the installed launcher exe on disk.
fn find_launcher() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(REG_KEY) {
            if let Ok(raw) = key.get_value::<String, _>("InstallLocation") {
                let dir = raw.trim_matches('"');
                let exe = PathBuf::from(dir).join(EXE_NAME);
                if exe.exists() {
                    return Some(exe);
                }
            }
        }
    }

    // Fallback: known default Tauri NSIS paths
    let candidates = [
        dirs::data_local_dir().map(|d| d.join(INSTALL_DIR).join(EXE_NAME)),
        dirs::data_local_dir().map(|d| d.join("Programs").join(INSTALL_DIR).join(EXE_NAME)),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Compare two version strings like "2.15.0" vs "2.11.0".
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |v: &str| {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect::<Vec<_>>()
    };
    parse(a).cmp(&parse(b))
}

fn show_error(msg: &str) {
    #[cfg(windows)]
    unsafe {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        let msg_w: Vec<u16> = OsStr::new(msg).encode_wide().chain(Some(0)).collect();
        let cap_w: Vec<u16> = OsStr::new("RPWorld Launcher")
            .encode_wide()
            .chain(Some(0))
            .collect();
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            0,
            msg_w.as_ptr(),
            cap_w.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR,
        );
    }
    #[cfg(not(windows))]
    eprintln!("{}", msg);
}
