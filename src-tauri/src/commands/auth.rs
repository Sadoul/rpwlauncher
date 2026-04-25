use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const ACCOUNTS_URL: &str = "https://raw.githubusercontent.com/Sadoul/rpwlauncher/main/public/auth/offline_accounts.rpwenc";
const ACCOUNTS_KEY: &[u8] = b"RPWLauncherFriendsOnlyKey_v1";
const ADMIN_USERNAME: &str = "Sadoul";
const ACCOUNTS_REPO_API: &str = "https://api.github.com/repos/Sadoul/rpwlauncher/contents/public/auth/offline_accounts.rpwenc";
const ACCOUNTS_BRANCH: &str = "main";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub account_type: String, // "offline" or "microsoft"
    #[serde(default)]
    pub is_admin: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OfflineCredential {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OfflineCredentialFile {
    accounts: Vec<OfflineCredential>,
}

#[derive(Debug, Deserialize)]
struct GitHubContentResponse {
    sha: String,
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

fn xor_bytes(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, byte)| byte ^ ACCOUNTS_KEY[i % ACCOUNTS_KEY.len()])
        .collect()
}

fn decrypt_accounts_payload(encrypted: &str) -> Result<OfflineCredentialFile, String> {
    let compact = encrypted.trim().replace(['\r', '\n', ' '], "");
    let encrypted_bytes = general_purpose::STANDARD
        .decode(compact)
        .map_err(|e| format!("Не удалось прочитать файл аккаунтов: {e}"))?;
    let json_bytes = xor_bytes(&encrypted_bytes);
    let json = String::from_utf8(json_bytes)
        .map_err(|e| format!("Файл аккаунтов повреждён: {e}"))?;
    serde_json::from_str(&json).map_err(|e| format!("Ошибка JSON аккаунтов: {e}"))
}

fn encrypt_accounts_payload(accounts: &OfflineCredentialFile) -> Result<String, String> {
    let json = serde_json::to_string(accounts).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(xor_bytes(json.as_bytes())))
}

async fn load_accounts() -> Result<OfflineCredentialFile, String> {
    let remote = reqwest::Client::builder()
        .user_agent("RPWLauncher/Accounts")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?
        .get(ACCOUNTS_URL)
        .send()
        .await;

    if let Ok(response) = remote {
        if response.status().is_success() {
            if let Ok(text) = response.text().await {
                if let Ok(accounts) = decrypt_accounts_payload(&text) {
                    return Ok(accounts);
                }
            }
        }
    }

    decrypt_accounts_payload(include_str!("../../../public/auth/offline_accounts.rpwenc"))
}

fn build_account(username: String) -> Account {
    Account {
        username: username.clone(),
        uuid: uuid::Uuid::new_v4().to_string().replace('-', ""),
        access_token: "0".to_string(),
        account_type: "offline".to_string(),
        is_admin: username.eq_ignore_ascii_case(ADMIN_USERNAME),
    }
}

#[tauri::command]
pub async fn login_offline(username: String, password: String) -> Result<Account, String> {
    let username = username.trim().to_string();
    let credentials = load_accounts().await?;
    let expected = credentials
        .accounts
        .iter()
        .find(|account| account.username.eq_ignore_ascii_case(&username))
        .ok_or_else(|| "Аккаунт не найден в списке RPWorld".to_string())?;

    if expected.password != password {
        return Err("Неверный пароль".to_string());
    }

    let account = build_account(expected.username.clone());
    let json = serde_json::to_string_pretty(&account).map_err(|e| e.to_string())?;
    fs::write(get_account_file(), json).map_err(|e| e.to_string())?;
    Ok(account)
}

#[tauri::command]
pub async fn get_admin_accounts(current_username: String) -> Result<Vec<OfflineCredential>, String> {
    if !current_username.eq_ignore_ascii_case(ADMIN_USERNAME) {
        return Err("Доступ запрещён".to_string());
    }
    let accounts = load_accounts().await?;
    Ok(accounts
        .accounts
        .into_iter()
        .filter(|account| !account.username.eq_ignore_ascii_case(ADMIN_USERNAME))
        .collect())
}

fn with_admin_account(accounts: Vec<OfflineCredential>) -> OfflineCredentialFile {
    let mut with_admin = vec![OfflineCredential {
        username: ADMIN_USERNAME.to_string(),
        password: "idi_nahui1".to_string(),
    }];
    with_admin.extend(accounts.into_iter().filter(|a| !a.username.eq_ignore_ascii_case(ADMIN_USERNAME)));
    OfflineCredentialFile { accounts: with_admin }
}

#[tauri::command]
pub async fn encrypt_admin_accounts(accounts: Vec<OfflineCredential>) -> Result<String, String> {
    encrypt_accounts_payload(&with_admin_account(accounts))
}

#[tauri::command]
pub async fn commit_admin_accounts(
    current_username: String,
    github_token: String,
    accounts: Vec<OfflineCredential>,
) -> Result<String, String> {
    if !current_username.eq_ignore_ascii_case(ADMIN_USERNAME) {
        return Err("Доступ запрещён".to_string());
    }

    let token = github_token.trim();
    if token.is_empty() {
        return Err("Введите GitHub token с доступом Contents: Read and write".to_string());
    }

    let encrypted = encrypt_accounts_payload(&with_admin_account(accounts))?;
    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher-AdminPanel")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let current = client
        .get(ACCOUNTS_REPO_API)
        .bearer_auth(token)
        .query(&[("ref", ACCOUNTS_BRANCH)])
        .send()
        .await
        .map_err(|e| format!("Не удалось получить текущий файл с GitHub: {e}"))?;

    if !current.status().is_success() {
        let status = current.status();
        let body = current.text().await.unwrap_or_default();
        return Err(format!("GitHub не отдал текущий файл: {status}. {body}"));
    }

    let current: GitHubContentResponse = current
        .json()
        .await
        .map_err(|e| format!("Не удалось разобрать ответ GitHub: {e}"))?;

    let payload = serde_json::json!({
        "message": "chore: update offline account passwords from launcher admin panel",
        "content": general_purpose::STANDARD.encode(encrypted.as_bytes()),
        "sha": current.sha,
        "branch": ACCOUNTS_BRANCH,
    });

    let update = client
        .put(ACCOUNTS_REPO_API)
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Не удалось отправить commit на GitHub: {e}"))?;

    if !update.status().is_success() {
        let status = update.status();
        let body = update.text().await.unwrap_or_default();
        return Err(format!("GitHub отклонил commit: {status}. {body}"));
    }

    Ok("Пароли обновлены: commit отправлен в GitHub".to_string())
}

#[tauri::command]
pub async fn login_microsoft() -> Result<Account, String> {
    let client_id = "00000000402b5328";
    let redirect_uri = "https://login.live.com/oauth20_desktop.srf";
    let auth_url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&redirect_uri={}&scope=XboxLive.signin%20offline_access",
        client_id, redirect_uri
    );
    open::that(&auth_url).map_err(|e| e.to_string())?;
    Err("Microsoft auth requires user to complete login in browser. Full implementation pending - please use offline mode for now.".to_string())
}

#[tauri::command]
pub async fn get_saved_account() -> Result<Option<Account>, String> {
    let path = get_account_file();
    if !path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut account: Account = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    account.is_admin = account.username.eq_ignore_ascii_case(ADMIN_USERNAME);
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
