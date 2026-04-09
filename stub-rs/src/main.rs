//! RPWorld Launcher Stub
//! Tiny Windows executable (~400 KB) that:
//!   1. If launcher already installed → launches it
//!   2. Otherwise → downloads latest NSIS installer from GitHub, runs it silently
//!
//! No Tauri, no WebView → compiles in ~60-90 seconds.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Command, exit};

#[derive(serde::Deserialize)]
struct GitHubRelease {
    assets: Vec<GitHubAsset>,
    tag_name: String,
}

#[derive(serde::Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

const GITHUB_REPO: &str = "Sadoul/rpwlauncher";
const EXE_NAME: &str = "rpw-launcher.exe";

fn main() {
    // 1. Try to find and launch already-installed launcher
    if let Some(path) = find_launcher() {
        let _ = Command::new(&path).spawn();
        exit(0);
    }

    // 2. Not installed — show a simple message box, then download + install
    #[cfg(windows)]
    unsafe {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let msg: Vec<u16> = OsStr::new("RPWorld Launcher не установлен.\nСейчас будет скачан и установлен автоматически.\n\nНажмите OK чтобы продолжить.")
            .encode_wide().chain(Some(0)).collect();
        let caption: Vec<u16> = OsStr::new("RPWorld Launcher").encode_wide().chain(Some(0)).collect();
        windows_sys::Win32::UI::WindowsAndMessaging::MessageBoxW(
            0,
            msg.as_ptr(),
            caption.as_ptr(),
            windows_sys::Win32::UI::WindowsAndMessaging::MB_OK
                | windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONINFORMATION,
        );
    }

    // 3. Fetch latest release from GitHub
    let client = reqwest::blocking::Client::builder()
        .user_agent("RPWorld-Stub/2.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| exit(1));

    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    let release: GitHubRelease = match client.get(&url).send().and_then(|r| r.json()) {
        Ok(r) => r,
        Err(_) => {
            show_error("Не удалось подключиться к GitHub. Проверьте интернет-соединение.");
            exit(1);
        }
    };

    // 4. Find NSIS setup exe in assets
    let setup_asset = release
        .assets
        .iter()
        .find(|a| a.name.contains("setup") && a.name.ends_with(".exe"))
        .or_else(|| release.assets.iter().find(|a| a.name.ends_with(".exe") && !a.name.contains("Stub")));

    let asset = match setup_asset {
        Some(a) => a,
        None => {
            show_error("Не удалось найти установщик в релизе GitHub.");
            exit(1);
        }
    };

    // 5. Download to %TEMP%
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(&asset.name);

    let bytes = match client.get(&asset.browser_download_url).send().and_then(|r| r.bytes()) {
        Ok(b) => b,
        Err(_) => {
            show_error("Ошибка скачивания установщика.");
            exit(1);
        }
    };

    if std::fs::write(&installer_path, &bytes).is_err() {
        show_error("Ошибка сохранения файла.");
        exit(1);
    }

    // 6. Run installer silently
    let _ = Command::new(&installer_path)
        .args(["/S"])
        .spawn()
        .and_then(|mut child| child.wait());

    // 7. Try to launch installed app
    std::thread::sleep(std::time::Duration::from_millis(2000));
    if let Some(path) = find_launcher() {
        let _ = Command::new(&path).spawn();
    }
}

/// Find the installed launcher exe on disk (registry → common paths)
fn find_launcher() -> Option<PathBuf> {
    // Check registry (NSIS writes InstallLocation)
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let keys = [
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.rpworld.launcher_is1",
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher_is1",
        ];
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for key_path in &keys {
            if let Ok(key) = hkcu.open_subkey(key_path) {
                if let Ok(dir) = key.get_value::<String, _>("InstallLocation") {
                    let exe = PathBuf::from(dir).join(EXE_NAME);
                    if exe.exists() { return Some(exe); }
                }
            }
        }
    }

    // Fallback: common install locations
    let candidates = [
        dirs::data_local_dir().map(|d| d.join("Programs").join("RPWorld Launcher").join(EXE_NAME)),
        dirs::home_dir().map(|d| d.join("AppData").join("Local").join("Programs").join("RPWorld Launcher").join(EXE_NAME)),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() { return Some(candidate); }
    }

    None
}

fn show_error(msg: &str) {
    #[cfg(windows)]
    unsafe {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        let msg_w: Vec<u16> = OsStr::new(msg).encode_wide().chain(Some(0)).collect();
        let cap_w: Vec<u16> = OsStr::new("RPWorld Launcher — Ошибка").encode_wide().chain(Some(0)).collect();
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
