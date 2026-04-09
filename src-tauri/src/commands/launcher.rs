use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

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
}

#[derive(Debug, Deserialize)]
struct Arguments {
    game: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
struct Downloads {
    client: Option<DownloadEntry>,
}

#[derive(Debug, Deserialize)]
struct DownloadEntry {
    url: String,
    sha1: Option<String>,
    size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct AssetIndex {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct Library {
    name: String,
    downloads: Option<LibraryDownloads>,
    rules: Option<Vec<Rule>>,
}

#[derive(Debug, Deserialize)]
struct LibraryDownloads {
    artifact: Option<LibraryArtifact>,
}

#[derive(Debug, Deserialize)]
struct LibraryArtifact {
    path: String,
    url: String,
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

    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
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
    let client = reqwest::Client::new();
    let mc_dir = game_dir
        .map(PathBuf::from)
        .unwrap_or_else(get_minecraft_dir);

    // 1. Download version manifest
    set_progress("manifest", 0.0, 1.0, "Загрузка списка версий...");
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest: VersionManifest = client
        .get(manifest_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let version_entry = manifest
        .versions
        .iter()
        .find(|v| v.id == version)
        .ok_or_else(|| format!("Version {} not found", version))?;

    // 2. Download version JSON
    set_progress("version", 0.0, 1.0, "Загрузка информации о версии...");
    let version_dir = mc_dir.join("versions").join(&version);
    let version_json_path = version_dir.join(format!("{}.json", version));
    download_file(&client, &version_entry.url, &version_json_path).await?;

    let version_json = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let version_info: VersionInfo =
        serde_json::from_str(&version_json).map_err(|e| e.to_string())?;

    // 3. Download client jar
    set_progress("client", 0.0, 1.0, "Скачивание клиента...");
    let client_jar_path = version_dir.join(format!("{}.jar", version));
    if let Some(downloads) = &version_info.downloads {
        if let Some(client_dl) = &downloads.client {
            download_file(&client, &client_dl.url, &client_jar_path).await?;
        }
    }

    // 4. Download libraries
    let total_libs = version_info.libraries.len() as f64;
    let mut classpath_entries: Vec<String> = Vec::new();

    for (i, lib) in version_info.libraries.iter().enumerate() {
        if !is_library_allowed(lib) {
            continue;
        }

        set_progress(
            "libraries",
            i as f64,
            total_libs,
            &format!("Скачивание библиотек... ({}/{})", i + 1, total_libs as u32),
        );

        if let Some(downloads) = &lib.downloads {
            if let Some(artifact) = &downloads.artifact {
                let lib_path = mc_dir.join("libraries").join(&artifact.path);
                download_file(&client, &artifact.url, &lib_path).await?;
                classpath_entries.push(lib_path.to_string_lossy().to_string());
            }
        }
    }

    classpath_entries.push(client_jar_path.to_string_lossy().to_string());

    // 5. Download assets
    if let Some(asset_index) = &version_info.asset_index {
        set_progress("assets", 0.0, 1.0, "Загрузка ресурсов...");
        let asset_index_path = mc_dir
            .join("assets")
            .join("indexes")
            .join(format!("{}.json", asset_index.id));
        download_file(&client, &asset_index.url, &asset_index_path).await?;

        let asset_json = fs::read_to_string(&asset_index_path).map_err(|e| e.to_string())?;
        let assets: AssetIndexFile =
            serde_json::from_str(&asset_json).map_err(|e| e.to_string())?;

        let total_assets = assets.objects.len() as f64;
        for (i, (_name, obj)) in assets.objects.iter().enumerate() {
            if i % 50 == 0 {
                set_progress(
                    "assets",
                    i as f64,
                    total_assets,
                    &format!(
                        "Скачивание ресурсов... ({}/{})",
                        i,
                        total_assets as u32
                    ),
                );
            }

            let hash_prefix = &obj.hash[..2];
            let asset_path = mc_dir
                .join("assets")
                .join("objects")
                .join(hash_prefix)
                .join(&obj.hash);
            let asset_url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                hash_prefix, obj.hash
            );
            download_file(&client, &asset_url, &asset_path).await?;
        }
    }

    // 6. Build and launch
    set_progress("launch", 1.0, 1.0, "Запуск игры...");

    let classpath = classpath_entries.join(";");
    let assets_dir = mc_dir.join("assets");
    let asset_index_name = version_info
        .assets
        .clone()
        .unwrap_or_else(|| version.clone());

    // Build JVM args
    let mut jvm_arg_list: Vec<String> = vec![format!("-Xmx{}M", max_memory)];

    // GPU mode hints
    let gpu = gpu_mode.as_deref().unwrap_or("auto");
    if gpu == "discrete" {
        // On Windows with NVIDIA Optimus: env hint is more reliable than JVM args
        // We add OpenGL hint
        jvm_arg_list.push("-Dsun.java2d.opengl=true".to_string());
    } else if gpu == "integrated" {
        jvm_arg_list.push("-Dsun.java2d.opengl=false".to_string());
    }

    // User custom JVM args (split by whitespace, respecting quotes is complex, keep simple)
    if let Some(ref extra) = jvm_args {
        let trimmed = extra.trim();
        if !trimmed.is_empty() {
            for arg in trimmed.split_whitespace() {
                jvm_arg_list.push(arg.to_string());
            }
        }
    } else {
        // Default GC flags when user hasn't set anything
        jvm_arg_list.extend([
            "-XX:+UnlockExperimentalVMOptions".to_string(),
            "-XX:+UseG1GC".to_string(),
            "-XX:G1NewSizePercent=20".to_string(),
            "-XX:G1ReservePercent=20".to_string(),
            "-XX:MaxGCPauseMillis=50".to_string(),
            "-XX:G1HeapRegionSize=32M".to_string(),
        ]);
    }

    jvm_arg_list.push(format!("-Djava.library.path={}", version_dir.join("natives").to_string_lossy()));
    jvm_arg_list.push("-cp".to_string());
    jvm_arg_list.push(classpath);
    jvm_arg_list.push(version_info.main_class.clone());

    let mut args = jvm_arg_list;

    // Add game arguments
    if let Some(mc_args) = &version_info.minecraft_arguments {
        let game_args = mc_args
            .replace("${auth_player_name}", &username)
            .replace("${version_name}", &version)
            .replace("${game_directory}", &mc_dir.to_string_lossy())
            .replace("${assets_root}", &assets_dir.to_string_lossy())
            .replace("${assets_index_name}", &asset_index_name)
            .replace("${auth_uuid}", &uuid)
            .replace("${auth_access_token}", &access_token)
            .replace("${user_type}", "legacy")
            .replace("${version_type}", "RPWLauncher");
        args.extend(game_args.split_whitespace().map(|s| s.to_string()));
    } else if let Some(arguments) = &version_info.arguments {
        if let Some(game_args) = &arguments.game {
            for arg in game_args {
                if let Some(s) = arg.as_str() {
                    let replaced = s
                        .replace("${auth_player_name}", &username)
                        .replace("${version_name}", &version)
                        .replace("${game_directory}", &mc_dir.to_string_lossy())
                        .replace("${assets_root}", &assets_dir.to_string_lossy())
                        .replace("${assets_index_name}", &asset_index_name)
                        .replace("${auth_uuid}", &uuid)
                        .replace("${auth_access_token}", &access_token)
                        .replace("${user_type}", "legacy")
                        .replace("${version_type}", "RPWLauncher");
                    args.push(replaced);
                }
            }
        }
    }

    let mut cmd = Command::new(&java_path);
    cmd.args(&args).current_dir(&mc_dir);

    // GPU env hints for NVIDIA Optimus (discrete GPU selection)
    let gpu = gpu_mode.as_deref().unwrap_or("auto");
    if gpu == "discrete" {
        cmd.env("__NV_PRIME_RENDER_OFFLOAD", "1");
        cmd.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
        cmd.env("__VK_LAYER_NV_optimus", "NVIDIA_only");
    }

    cmd.spawn()
        .map_err(|e| format!("Failed to launch Minecraft: {}", e))?;

    set_progress("done", 1.0, 1.0, "Игра запущена!");

    Ok("Game launched successfully".to_string())
}

#[tauri::command]
pub async fn get_launch_progress() -> Result<Option<LaunchProgress>, String> {
    Ok(LAUNCH_PROGRESS.lock().map_err(|e| e.to_string())?.clone())
}
