mod commands;

use commands::{auth, downloader, java, launcher, settings, updater, versions};

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| format!("Не удалось открыть URL: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
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
            // Java
            java::find_java,
            java::download_java,
            // Versions (custom modpacks)
            versions::get_mc_versions,
            versions::get_loader_versions,
            versions::install_custom_modpack,
            // Settings
            settings::save_avatar,
            settings::get_avatar,
            settings::open_data_folder,
            settings::delete_launcher,
            // Misc
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
