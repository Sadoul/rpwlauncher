mod commands;

use commands::{auth, downloader, java, launcher, updater};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            auth::login_offline,
            auth::login_microsoft,
            auth::get_saved_account,
            auth::logout,
            launcher::launch_game,
            launcher::get_launch_progress,
            downloader::download_modpack,
            downloader::get_download_progress,
            downloader::check_modpack_update,
            updater::check_launcher_update,
            updater::update_launcher,
            java::find_java,
            java::download_java,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
