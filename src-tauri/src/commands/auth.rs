use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub account_type: String, // "offline" or "microsoft"
}

fn get_config_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".rpworld");
    fs::create_dir_all(&dir).ok();
    dir
}

fn get_account_file() -> PathBuf {
    get_config_dir().join("account.json")
}

#[tauri::command]
pub async fn login_offline(username: String) -> Result<Account, String> {
    let uuid = uuid::Uuid::new_v4().to_string().replace("-", "");
    let account = Account {
        username: username.clone(),
        uuid,
        access_token: "0".to_string(),
        account_type: "offline".to_string(),
    };

    let json = serde_json::to_string_pretty(&account).map_err(|e| e.to_string())?;
    fs::write(get_account_file(), json).map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
pub async fn login_microsoft() -> Result<Account, String> {
    // Microsoft OAuth flow:
    // 1. Open browser for Microsoft login
    // 2. Get auth code via redirect
    // 3. Exchange for Xbox Live token
    // 4. Get XSTS token
    // 5. Get Minecraft token
    // 6. Get Minecraft profile

    let client_id = "00000000402b5328"; // Public Minecraft client ID
    let redirect_uri = "https://login.live.com/oauth20_desktop.srf";
    let auth_url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
        client_id, redirect_uri
    );

    // Open browser for auth
    open::that(&auth_url).map_err(|e| e.to_string())?;

    // For now, return a placeholder - full OAuth flow requires a local server
    // or manual code entry. We'll implement a simplified version.
    Err("Microsoft auth requires user to complete login in browser. Full implementation pending - please use offline mode for now.".to_string())
}

#[tauri::command]
pub async fn get_saved_account() -> Result<Option<Account>, String> {
    let path = get_account_file();
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let account: Account = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(Some(account))
}

#[tauri::command]
pub async fn logout() -> Result<(), String> {
    let path = get_account_file();
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
