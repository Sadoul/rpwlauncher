mod commands;

use commands::{auth, downloader, java, launcher, logger, settings, updater, versions};
use tauri::Manager;

#[cfg(windows)]
fn set_windows_app_user_model_id() {
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let app_id = HSTRING::from("com.rpworld.launcher");
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(&app_id);
    }
}

#[cfg(windows)]
fn force_windows_taskbar_icon(window: &tauri::WebviewWindow) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::PathBuf;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        LoadImageW, SendMessageW, IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE, WM_SETICON,
    };

    let Ok(handle) = window.window_handle() else { return; };
    let RawWindowHandle::Win32(win32_handle) = handle.as_raw() else { return; };
    let hwnd = HWND(win32_handle.hwnd.get() as *mut _);

    let icon_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons").join("icon.ico");
    let icon_path_wide: Vec<u16> = OsStr::new(&icon_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let hicon_big = LoadImageW(
            None,
            windows::core::PCWSTR(icon_path_wide.as_ptr()),
            IMAGE_ICON,
            256,
            256,
            LR_LOADFROMFILE,
        );
        if let Ok(icon) = hicon_big {
            SendMessageW(hwnd, WM_SETICON, WPARAM(1), LPARAM(icon.0 as isize));
        }

        let hicon_small = LoadImageW(
            None,
            windows::core::PCWSTR(icon_path_wide.as_ptr()),
            IMAGE_ICON,
            16,
            16,
            LR_LOADFROMFILE | LR_DEFAULTSIZE,
        );
        if let Ok(icon) = hicon_small {
            SendMessageW(hwnd, WM_SETICON, WPARAM(0), LPARAM(icon.0 as isize));
        }
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Не удалось открыть URL: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    set_windows_app_user_model_id();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.addEventListener('contextmenu', event => event.preventDefault(), { capture: true });");
            }

            // Explicitly set the taskbar/window icon at runtime.
            // tauri::include_image! decodes PNG at compile time into RGBA bytes.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/128x128.png"));
                #[cfg(windows)]
                force_windows_taskbar_icon(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            auth::login_offline,
            auth::login_microsoft,
            auth::get_saved_account,
            auth::logout,
            // Launcher
            launcher::launch_game,
            launcher::get_launch_progress,
            // Downloader
            downloader::download_modpack,
            downloader::get_download_progress,
            downloader::check_modpack_update,
            downloader::cancel_download,
            // Updater
            updater::check_launcher_update,
            updater::update_launcher,
            updater::check_just_updated,
            // Java
            java::find_java,
            java::download_java,
            // Versions (custom modpacks)
            versions::get_mc_versions,
            versions::get_loader_versions,
            versions::get_custom_modpacks,
            versions::delete_custom_modpack,
            versions::install_custom_modpack,
            // Settings
            settings::save_avatar,
            settings::get_avatar,
            settings::open_data_folder,
            settings::delete_launcher,
            // Logger
            logger::set_logging_enabled,
            logger::get_log,
            logger::clear_log,
            logger::get_log_path,
            // Misc
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
