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
