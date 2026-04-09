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
}

#[derive(serde::Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

const GITHUB_REPO: &str = "Sadoul/rpwlauncher";
const EXE_NAME:    &str = "rpw-launcher.exe";
// Tauri NSIS installs to %LOCALAPPDATA%\<productName>
// productName = "RPWorld Launcher"  →  InstallLocation = %LOCALAPPDATA%\RPWorld Launcher
const INSTALL_DIR: &str = "RPWorld Launcher";
// Registry key written by Tauri NSIS (no _is1 suffix for currentUser mode)
const REG_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RPWorld Launcher";

fn main() {
    // 1. Try to find and launch already-installed launcher
    if let Some(path) = find_launcher() {
        let _ = Command::new(&path).spawn();
        exit(0);
    }

    // 2. Not installed — inform the user, then download + install
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

    // 3. Fetch latest release from GitHub
    let client = reqwest::blocking::Client::builder()
        .user_agent("RPWorld-Stub/2.2")
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

    // 4. Find NSIS setup exe in assets (prefer "setup" in name)
    let asset = release
        .assets
        .iter()
        .find(|a| a.name.contains("setup") && a.name.ends_with(".exe"))
        .or_else(|| {
            release
                .assets
                .iter()
                .find(|a| a.name.ends_with(".exe") && !a.name.contains("Stub") && !a.name.contains("stub"))
        });

    let asset = match asset {
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

    // 7. Try to launch installed app (give NSIS a moment to finish)
    std::thread::sleep(std::time::Duration::from_millis(2500));
    if let Some(path) = find_launcher() {
        let _ = Command::new(&path).spawn();
    }
}

/// Find the installed launcher exe on disk.
///
/// Search order:
///   1. HKCU registry key written by Tauri NSIS (`RPWorld Launcher`)
///   2. Known default install path: %LOCALAPPDATA%\RPWorld Launcher\rpw-launcher.exe
fn find_launcher() -> Option<PathBuf> {
    // ── 1. Registry (most reliable) ───────────────────────────────────────────
    #[cfg(windows)]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(REG_KEY) {
            if let Ok(raw) = key.get_value::<String, _>("InstallLocation") {
                // NSIS stores the value with surrounding quotes → strip them
                let dir = raw.trim_matches('"');
                let exe = PathBuf::from(dir).join(EXE_NAME);
                if exe.exists() {
                    return Some(exe);
                }
            }
        }
    }

    // ── 2. Fallback: default Tauri NSIS path ─────────────────────────────────
    // Tauri NSIS with installMode="currentUser" installs to:
    //   %LOCALAPPDATA%\<productName>\<binaryName>.exe
    let candidates = [
        // Primary: %LOCALAPPDATA%\RPWorld Launcher\rpw-launcher.exe
        dirs::data_local_dir().map(|d| d.join(INSTALL_DIR).join(EXE_NAME)),
        // Secondary: some older Tauri versions use Programs sub-folder
        dirs::data_local_dir().map(|d| d.join("Programs").join(INSTALL_DIR).join(EXE_NAME)),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
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
