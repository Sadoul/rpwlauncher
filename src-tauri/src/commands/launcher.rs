use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use super::logger::log;

static LAUNCH_PROGRESS: Mutex<Option<LaunchProgress>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LaunchProgress {
    pub stage: String,
    pub progress: f64,
    pub total: f64,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct VersionManifest {
    versions: Vec<VersionEntry>,
}

#[derive(Debug, Deserialize)]
struct VersionEntry {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct VersionInfo {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    libraries: Vec<Library>,
    downloads: Option<Downloads>,
    #[serde(rename = "assetIndex")]
    asset_index: Option<AssetIndex>,
    assets: Option<String>,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: Option<String>,
    arguments: Option<Arguments>,
    #[serde(rename = "inheritsFrom")]
    inherits_from: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Arguments {
    game: Option<Vec<serde_json::Value>>,
    jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct Downloads {
    client: Option<DownloadEntry>,
}

#[derive(Debug, Deserialize)]
struct DownloadEntry {
    url: String,
    #[allow(dead_code)]
    sha1: Option<String>,
    #[allow(dead_code)]
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Library {
    #[allow(dead_code)]
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<LibraryArtifact>,
}

#[derive(Debug, Deserialize)]
struct LibraryArtifact {
    path: String,
    url: String,
    #[allow(dead_code)]
    sha1: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Debug, Deserialize)]
struct OsRule {
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AssetIndexFile {
    objects: HashMap<String, AssetObject>,
}

#[derive(Debug, Deserialize)]
struct AssetObject {
    hash: String,
    #[allow(dead_code)]
    size: u64,
}

fn get_minecraft_dir() -> PathBuf {
    let dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".rpworld")
        .join("minecraft");
    fs::create_dir_all(&dir).ok();
    dir
}

fn set_progress(stage: &str, progress: f64, total: f64, message: &str) {
    log(&format!("[{}] {}", stage, message));
    if let Ok(mut p) = LAUNCH_PROGRESS.lock() {
        *p = Some(LaunchProgress {
            stage: stage.to_string(),
            progress,
            total,
            message: message.to_string(),
        });
    }
}

async fn download_file(client: &reqwest::Client, url: &str, path: &PathBuf) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    log(&format!("Downloading: {}", url));
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} for {}", response.status(), url));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    fs::write(path, &bytes).map_err(|e| e.to_string())?;

    Ok(())
}

fn is_library_allowed(lib: &Library) -> bool {
    if let Some(rules) = &lib.rules {
        let mut allowed = false;
        for rule in rules {
            let os_match = match &rule.os {
                Some(os) => os.name.as_deref() == Some("windows"),
                None => true,
            };
            if os_match {
                allowed = rule.action == "allow";
            }
        }
        return allowed;
    }
    true
}

/// Detect if version string refers to Forge and return (mc_version, "forge")
fn parse_forge_version(version: &str) -> Option<String> {
    // Patterns: "forge-1.20.1", "1.20.1-forge", "1.20.1-forge-47.x.x"
    if version.starts_with("forge-") {
        return Some(version.trim_start_matches("forge-").to_string());
    }
    if version.contains("-forge") {
        let mc = version.split("-forge").next()?.to_string();
        return Some(mc);
    }
    None
}

/// Find the latest Forge version for a given MC version from maven metadata
async fn get_latest_forge_version(client: &reqwest::Client, mc_version: &str) -> Result<String, String> {
    let url = "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml";
    log(&format!("Fetching Forge maven metadata from {}", url));
    let xml = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    // Parse versions manually — find all versions that start with mc_version-
    let prefix = format!("{}-", mc_version);
    let mut matching: Vec<String> = Vec::new();

    for line in xml.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<version>") && trimmed.ends_with("</version>") {
            let v = trimmed
                .trim_start_matches("<version>")
                .trim_end_matches("</version>")
                .to_string();
            if v.starts_with(&prefix) {
                matching.push(v);
            }
        }
    }

    matching
        .into_iter()
        .last()
        .ok_or_else(|| format!("No Forge version found for MC {}", mc_version))
}

/// Check if Forge is already installed and return its version ID
fn find_installed_forge(mc_dir: &PathBuf, mc_version: &str) -> Option<String> {
    let versions_dir = mc_dir.join("versions");
    if !versions_dir.exists() {
        return None;
    }
    if let Ok(entries) = fs::read_dir(&versions_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.contains("forge") && name.contains(mc_version) {
                let json = entry.path().join(format!("{}.json", name));
                if json.exists() {
                    log(&format!("Found existing Forge install: {}", name));
                    return Some(name);
                }
            }
        }
    }
    None
}

/// Ensure vanilla MC is installed (version JSON + client jar)
async fn ensure_vanilla(
    client: &reqwest::Client,
    mc_dir: &PathBuf,
    mc_version: &str,
) -> Result<(), String> {
    let version_dir = mc_dir.join("versions").join(mc_version);
    let version_json_path = version_dir.join(format!("{}.json", mc_version));

    if version_json_path.exists() {
        log(&format!("Vanilla {} already installed", mc_version));
        return Ok(());
    }

    set_progress("vanilla", 0.0, 1.0, &format!("Загрузка манифеста версий Minecraft..."));
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest: VersionManifest = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("Vanilla {} not found in manifest", mc_version))?;

    set_progress("vanilla", 0.5, 1.0, &format!("Скачивание Minecraft {}...", mc_version));
    download_file(client, &entry.url, &version_json_path).await?;

    // Also download client jar so Forge installer can merge it
    let version_info: VersionInfo = serde_json::from_str(
        &fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;

    let client_jar = version_dir.join(format!("{}.jar", mc_version));
    if let Some(dl) = &version_info.downloads {
        if let Some(c) = &dl.client {
            download_file(client, &c.url, &client_jar).await?;
        }
    }

    log(&format!("Vanilla {} installed", mc_version));
    Ok(())
}

/// Download and run Forge installer, return the installed forge version ID
async fn install_forge(
    client: &reqwest::Client,
    java_path: &str,
    mc_dir: &PathBuf,
    mc_version: &str,
) -> Result<String, String> {
    // Get latest forge version
    set_progress("forge", 0.0, 4.0, "Поиск версии Forge...");
    let forge_ver = get_latest_forge_version(client, mc_version).await?;
    log(&format!("Installing Forge {}", forge_ver));

    // Download installer
    set_progress("forge", 1.0, 4.0, &format!("Скачивание Forge {}...", forge_ver));
    let installer_url = format!(
        "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
        forge_ver, forge_ver
    );
    let installer_path = mc_dir.join("forge-installer.jar");
    // Force re-download of installer
    if installer_path.exists() { let _ = fs::remove_file(&installer_path); }
    download_file(client, &installer_url, &installer_path).await?;

    // Run installer headlessly
    set_progress("forge", 2.0, 4.0, "Установка Forge (это займёт несколько минут)...");
    log(&format!("Running Forge installer: {} -Djava.awt.headless=true -jar {}", java_path, installer_path.display()));

    let status = tokio::process::Command::new(java_path)
        .args([
            "-Djava.awt.headless=true",
            "-jar",
            installer_path.to_str().unwrap_or_default(),
            "--installClient",
        ])
        .current_dir(mc_dir)
        .status()
        .await
        .map_err(|e| format!("Не удалось запустить Forge installer: {}", e))?;

    let _ = fs::remove_file(&installer_path);

    if !status.success() {
        return Err(format!("Forge installer завершился с ошибкой (код {})", status));
    }

    // Find installed forge version
    set_progress("forge", 3.0, 4.0, "Forge установлен, проверка...");
    find_installed_forge(mc_dir, mc_version)
        .ok_or_else(|| "Forge installer завершился, но версия не найдена".to_string())
}

/// Download libraries from a version JSON (handles both vanilla and Forge style)
async fn download_libraries(
    client: &reqwest::Client,
    mc_dir: &PathBuf,
    libraries: &[Library],
    stage: &str,
) -> Result<Vec<String>, String> {
    let total = libraries.len() as f64;
    let mut classpath: Vec<String> = Vec::new();

    for (i, lib) in libraries.iter().enumerate() {
        if !is_library_allowed(lib) {
            continue;
        }

        if i % 10 == 0 {
            set_progress(stage, i as f64, total,
                &format!("Библиотеки ({}/{})", i + 1, total as u32));
        }

        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                let lib_path = mc_dir.join("libraries").join(&artifact.path);
                download_file(client, &artifact.url, &lib_path).await?;
                classpath.push(lib_path.to_string_lossy().to_string());
            }
        }
    }

    Ok(classpath)
}

#[tauri::command]
pub async fn launch_game(
    username: String,
    uuid: String,
    access_token: String,
    version: String,
    java_path: String,
    max_memory: u32,
    game_dir: Option<String>,
    jvm_args: Option<String>,
    gpu_mode: Option<String>,
) -> Result<String, String> {
    log(&format!("=== Launch requested: version={}, user={}", version, username));
    let client = reqwest::Client::builder()
        .user_agent("RPWLauncher/2.7")
        .build()
        .map_err(|e| e.to_string())?;

    let mc_dir = game_dir
        .map(PathBuf::from)
        .unwrap_or_else(get_minecraft_dir);

    log(&format!("Game dir: {}", mc_dir.display()));

    // ── Detect Forge version ────────────────────────────────────────────────
    let actual_version = if let Some(mc_version) = parse_forge_version(&version) {
        log(&format!("Forge version detected, MC base: {}", mc_version));

        // Check if already installed
        let installed = find_installed_forge(&mc_dir, &mc_version);

        if let Some(forge_id) = installed {
            forge_id
        } else {
            // Need to install vanilla first, then Forge
            ensure_vanilla(&client, &mc_dir, &mc_version).await?;
            install_forge(&client, &java_path, &mc_dir, &mc_version).await?
        }
    } else {
        // Plain vanilla version
        version.clone()
    };

    log(&format!("Launching with version: {}", actual_version));

    // ── Load version JSON ───────────────────────────────────────────────────
    set_progress("version", 0.0, 1.0, "Загрузка информации о версии...");

    let version_dir = mc_dir.join("versions").join(&actual_version);
    let version_json_path = version_dir.join(format!("{}.json", actual_version));

    // If version JSON missing for a vanilla version, download it
    if !version_json_path.exists() {
        let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
        let manifest: VersionManifest = client.get(manifest_url).send().await
            .map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
        let entry = manifest.versions.iter().find(|v| v.id == actual_version)
            .ok_or_else(|| format!("Version {} not found", actual_version))?;
        download_file(&client, &entry.url, &version_json_path).await?;
    }

    let version_info: VersionInfo = serde_json::from_str(
        &fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;

    // ── Handle inheritsFrom (Forge inherits from vanilla) ───────────────────
    let (base_version_info, base_version_dir) = if let Some(ref base) = version_info.inherits_from {
        log(&format!("Version inherits from: {}", base));
        let base_dir = mc_dir.join("versions").join(base);
        let base_json = base_dir.join(format!("{}.json", base));

        if !base_json.exists() {
            ensure_vanilla(&client, &mc_dir, base).await?;
        }

        let info: VersionInfo = serde_json::from_str(
            &fs::read_to_string(&base_json).map_err(|e| e.to_string())?,
        ).map_err(|e| e.to_string())?;
        (Some(info), Some(base_dir))
    } else {
        (None, None)
    };

    // ── Download client jar ─────────────────────────────────────────────────
    set_progress("client", 0.0, 1.0, "Скачивание клиента...");

    // For Forge, the client jar comes from the inherited vanilla version
    let effective_downloads = version_info.downloads.as_ref()
        .or_else(|| base_version_info.as_ref().and_then(|b| b.downloads.as_ref()));

    let effective_version_dir = base_version_dir.as_ref().unwrap_or(&version_dir);
    let effective_version_id = version_info.inherits_from.as_deref().unwrap_or(&actual_version);
    let client_jar_path = effective_version_dir.join(format!("{}.jar", effective_version_id));

    if let Some(dl) = effective_downloads {
        if let Some(c) = &dl.client {
            download_file(&client, &c.url, &client_jar_path).await?;
        }
    }

    // ── Download libraries ──────────────────────────────────────────────────
    // Merge libraries from base (vanilla) + overlay (Forge)
    let mut all_libs: Vec<&Library> = Vec::new();
    if let Some(ref base) = base_version_info {
        all_libs.extend(base.libraries.iter());
    }
    all_libs.extend(version_info.libraries.iter());

    let total_libs = all_libs.len() as f64;
    let mut classpath_entries: Vec<String> = Vec::new();

    for (i, lib) in all_libs.iter().enumerate() {
        if !is_library_allowed(lib) { continue; }

        if i % 10 == 0 {
            set_progress("libraries", i as f64, total_libs,
                &format!("Скачивание библиотек... ({}/{})", i + 1, total_libs as u32));
        }

        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                let lib_path = mc_dir.join("libraries").join(&artifact.path);
                download_file(&client, &artifact.url, &lib_path).await?;
                classpath_entries.push(lib_path.to_string_lossy().to_string());
            }
        }
    }

    classpath_entries.push(client_jar_path.to_string_lossy().to_string());

    // ── Download assets ─────────────────────────────────────────────────────
    let effective_asset_index = version_info.asset_index.as_ref()
        .or_else(|| base_version_info.as_ref().and_then(|b| b.asset_index.as_ref()));

    if let Some(asset_index) = effective_asset_index {
        set_progress("assets", 0.0, 1.0, "Загрузка ресурсов...");
        let asset_index_path = mc_dir.join("assets").join("indexes")
            .join(format!("{}.json", asset_index.id));
        download_file(&client, &asset_index.url, &asset_index_path).await?;

        let asset_json = fs::read_to_string(&asset_index_path).map_err(|e| e.to_string())?;
        let assets: AssetIndexFile = serde_json::from_str(&asset_json).map_err(|e| e.to_string())?;

        let total_assets = assets.objects.len() as f64;
        for (i, (_name, obj)) in assets.objects.iter().enumerate() {
            if i % 50 == 0 {
                set_progress("assets", i as f64, total_assets,
                    &format!("Скачивание ресурсов... ({}/{})", i, total_assets as u32));
            }
            let hash_prefix = &obj.hash[..2];
            let asset_path = mc_dir.join("assets").join("objects").join(hash_prefix).join(&obj.hash);
            let asset_url = format!("https://resources.download.minecraft.net/{}/{}", hash_prefix, obj.hash);
            download_file(&client, &asset_url, &asset_path).await?;
        }
    }

    // ── Build launch command ────────────────────────────────────────────────
    set_progress("launch", 1.0, 1.0, "Запуск игры...");

    let classpath = classpath_entries.join(";");
    let assets_dir = mc_dir.join("assets");
    let effective_assets = version_info.assets.clone()
        .or_else(|| base_version_info.as_ref().and_then(|b| b.assets.clone()))
        .unwrap_or_else(|| actual_version.clone());

    // JVM args
    let mut jvm_arg_list: Vec<String> = vec![format!("-Xmx{}M", max_memory)];

    let gpu = gpu_mode.as_deref().unwrap_or("auto");
    if gpu == "discrete" {
        jvm_arg_list.push("-Dsun.java2d.opengl=true".to_string());
    } else if gpu == "integrated" {
        jvm_arg_list.push("-Dsun.java2d.opengl=false".to_string());
    }

    if let Some(ref extra) = jvm_args {
        let trimmed = extra.trim();
        if !trimmed.is_empty() {
            for arg in trimmed.split_whitespace() {
                jvm_arg_list.push(arg.to_string());
            }
        }
    } else {
        jvm_arg_list.extend([
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+UseG1GC".to_string(),
            "-XX:G1NewSizePercent=20".to_string(),
            "-XX:G1ReservePercent=20".to_string(),
            "-XX:MaxGCPauseMillis=50".to_string(),
            "-XX:G1HeapRegionSize=32M".to_string(),
        ]);
    }

    let natives_dir = version_dir.join("natives");
    jvm_arg_list.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));

    // Handle Forge JVM args from version JSON
    let main_class = version_info.main_class.clone();
    if let Some(ref args_obj) = version_info.arguments {
        if let Some(jvm_args_list) = &args_obj.jvm {
            for arg in jvm_args_list {
                if let Some(s) = arg.as_str() {
                    let replaced = s
                        .replace("${classpath}", &classpath)
                        .replace("${natives_directory}", &natives_dir.to_string_lossy())
                        .replace("${launcher_name}", "RPWLauncher")
                        .replace("${launcher_version}", "2.7")
                        .replace("${library_directory}", &mc_dir.join("libraries").to_string_lossy())
                        .replace("${classpath_separator}", ";");
                    jvm_arg_list.push(replaced);
                }
            }
        }
    }

    jvm_arg_list.push("-cp".to_string());
    jvm_arg_list.push(classpath.clone());
    jvm_arg_list.push(main_class);

    let mut args = jvm_arg_list;

    // Game arguments — check both formats
    let effective_mc_args = version_info.minecraft_arguments.as_ref()
        .or_else(|| base_version_info.as_ref().and_then(|b| b.minecraft_arguments.as_ref()));

    if let Some(mc_args) = effective_mc_args {
        let game_args = mc_args
            .replace("${auth_player_name}", &username)
            .replace("${version_name}", &actual_version)
            .replace("${game_directory}", &mc_dir.to_string_lossy())
            .replace("${assets_root}", &assets_dir.to_string_lossy())
            .replace("${assets_index_name}", &effective_assets)
            .replace("${auth_uuid}", &uuid)
            .replace("${auth_access_token}", &access_token)
            .replace("${user_type}", "legacy")
            .replace("${version_type}", "RPWLauncher");
        args.extend(game_args.split_whitespace().map(|s| s.to_string()));
    } else {
        // Modern arguments format
        let check_args = |info: &VersionInfo| {
            info.arguments.as_ref().and_then(|a| a.game.as_ref()).map(|g| g.clone())
        };
        let game_args_list = check_args(&version_info)
            .or_else(|| base_version_info.as_ref().and_then(|b| check_args(b)));

        if let Some(game_args) = game_args_list {
            for arg in &game_args {
                if let Some(s) = arg.as_str() {
                    let replaced = s
                        .replace("${auth_player_name}", &username)
                        .replace("${version_name}", &actual_version)
                        .replace("${game_directory}", &mc_dir.to_string_lossy())
                        .replace("${assets_root}", &assets_dir.to_string_lossy())
                        .replace("${assets_index_name}", &effective_assets)
                        .replace("${auth_uuid}", &uuid)
                        .replace("${auth_access_token}", &access_token)
                        .replace("${user_type}", "legacy")
                        .replace("${version_type}", "RPWLauncher");
                    args.push(replaced);
                }
            }
        }
    }

    log(&format!("Launching: {} {:?}", java_path, &args[..args.len().min(8)]));

    let mut cmd = Command::new(&java_path);
    cmd.args(&args).current_dir(&mc_dir);

    if gpu == "discrete" {
        cmd.env("__NV_PRIME_RENDER_OFFLOAD", "1");
        cmd.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        cmd.env("__VK_LAYER_NV_optimus", "NVIDIA_only");
    }

    cmd.spawn()
        .map_err(|e| { let msg = format!("Не удалось запустить игру: {}", e); log(&msg); msg })?;

    log("Game launched successfully");
    set_progress("done", 1.0, 1.0, "Игра запущена!");

    Ok("Game launched successfully".to_string())
}

#[tauri::command]
pub async fn get_launch_progress() -> Result<Option<LaunchProgress>, String> {
    Ok(LAUNCH_PROGRESS.lock().map_err(|e| e.to_string())?.clone())
}
