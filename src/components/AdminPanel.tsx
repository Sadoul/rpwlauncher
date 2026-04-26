import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AccountRow {
  username: string;
  password: string;
  role?: string;
}


interface BuildFileEntry {
  name: string;
  path: string;
  url: string;
  sha1: string;
  size: number;
  enabled: boolean;
}

interface BuildManifest {
  name: string;
  minecraft_version: string;
  loader: string;
  loader_version: string;
  mods: BuildFileEntry[];
}

interface Props {
  username: string;
  isOwner: boolean;
}


const ADMIN_NAME = "Sadoul";
const BUILD_NAMES = ["rpworld", "minigames"];
const LOADERS = ["vanilla", "forge", "fabric", "neoforge", "optifine"];

const formatSize = (size: number) => `${(size / 1024 / 1024).toFixed(1)} МБ`;

export default function AdminPanel({ username, isOwner }: Props) {

  const [activeTab, setActiveTab] = useState<"accounts" | "builds">("accounts");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState("");

  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [activeBuild, setActiveBuild] = useState("rpworld");
  const [manifest, setManifest] = useState<BuildManifest | null>(null);
  const [uploadingMod, setUploadingMod] = useState(false);
  const [modSearch, setModSearch] = useState("");
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [downloadDir, setDownloadDir] = useState("");


  useEffect(() => {
    load();
    loadToken();
    loadVersions();
    loadDownloadDir();
  }, []);

  const loadVersions = async () => {
    try {
      const resp = await invoke<any[]>("get_mc_versions");
      const releaseVersions = resp
        .filter(v => (v.version_type ?? v.type) === "release")
        .map(v => v.id);

      setAvailableVersions(releaseVersions);
    } catch {
      setAvailableVersions([]);
    }
  };

  const loadDownloadDir = async () => {
    try {
      setDownloadDir(await invoke<string>("get_build_download_dir"));
    } catch { /* ignore */ }
  };


  useEffect(() => {
    if (isOwner && githubToken.trim()) loadManifest(activeBuild);
  }, [activeBuild, githubToken, isOwner]);

  const notify = (text: string) => {
    setMessage(text);
    setToast(text);
    window.setTimeout(() => setToast(""), 4500);
  };


  const load = async () => {
    try {
      const list = await invoke<AccountRow[]>("get_admin_accounts", { currentUsername: username });
      setAccounts(list);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const loadToken = async () => {
    try {
      const token = await invoke<string>("get_admin_token", { currentUsername: username });
      setGithubToken(token);
    } catch {
      // ignore
    }
  };

  const loadManifest = async (build: string) => {
    try {
      const data = await invoke<BuildManifest>("get_build_manifest", { build, githubToken });
      setManifest(data);
    } catch (e) {
      setMessage(String(e));
      setManifest(null);
    }
  };

  const saveToken = async (token: string) => {
    setGithubToken(token);
    try {
      await invoke("save_admin_token", { currentUsername: username, githubToken: token });
    } catch {
      // token will still stay in state until restart
    }
  };

  const updatePassword = (index: number, password: string) => {
    setAccounts(prev => prev.map((row, i) => i === index ? { ...row, password } : row));
  };

  const addAccount = () => {
    const nextUsername = newUsername.trim();
    const nextPassword = newPassword.trim();
    if (!nextUsername || !nextPassword) {
      setMessage("Введите ник и пароль нового игрока");
      return;
    }
    if (accounts.some(a => a.username.toLowerCase() === nextUsername.toLowerCase())) {
      setMessage(`Игрок ${nextUsername} уже есть`);
      return;
    }
    setAccounts(prev => [...prev, { username: nextUsername, password: nextPassword }]);
    setNewUsername("");
    setNewPassword("");
      notify(`Игрок ${nextUsername} добавлен локально. Нажмите подтверждение, чтобы отправить commit.`);

  };

  const deleteAccount = (account: AccountRow) => {
    if (account.username.toLowerCase() === ADMIN_NAME.toLowerCase()) {
      setMessage("Нельзя удалить Sadoul");
      return;
    }
    const ok = window.confirm(`Удалить игрока ${account.username}? Это применится после commit.`);
    if (!ok) return;
    setAccounts(prev => prev.filter(a => a.username !== account.username));
  };

  const commitChanges = async () => {
    setSaving(true);
    setMessage("Шифрую файл и отправляю commit на GitHub...");
    try {
      const result = await invoke<string>("commit_admin_accounts", {
        currentUsername: username,
        githubToken,
        accounts,
      });
      setMessage(result);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateManifest = (patch: Partial<BuildManifest>) => {
    setManifest(prev => prev ? { ...prev, ...patch } : prev);
  };

  const updateMod = (index: number, patch: Partial<BuildFileEntry>) => {
    setManifest(prev => prev ? {
      ...prev,
      mods: prev.mods.map((mod, i) => i === index ? { ...mod, ...patch } : mod),
    } : prev);
  };

  const deleteMod = (mod: BuildFileEntry) => {
    const ok = window.confirm(`Удалить мод ${mod.name} из списка сборки? Файл в GitHub пока останется, но клиент перестанет его скачивать.`);
    if (!ok) return;
    setManifest(prev => prev ? { ...prev, mods: prev.mods.filter(m => m.name !== mod.name) } : prev);
  };

  const downloadMod = async (mod: BuildFileEntry) => {
    notify(`Скачиваю ${mod.name}...`);

    try {
      const path = await invoke<string>("download_build_mod_file", { modEntry: mod });
      notify(`Мод сохранён: ${path}`);

    } catch (e) {
      setMessage(String(e));
    }
  };

  const downloadBuild = async () => {
    if (!manifest) return;
    notify(`Скачиваю сборку ${activeBuild}...`);

    try {
      const result = await invoke<string>("download_build_bundle", { build: activeBuild, manifest });
      setMessage(result);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const chooseDownloadDir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Выберите папку сохранения" });
      if (typeof selected === "string") {
        await invoke("set_build_download_dir", { path: selected });
        setDownloadDir(selected);
        notify(`Папка сохранения: ${selected}`);

      }
    } catch (e) {
      setMessage(String(e));
    }
  };


  const uploadModPath = async (path: string) => {
    if (!manifest || !path) return;
    setUploadingMod(true);
    setMessage(`Загружаю мод ${path}...`);
    try {
      const entry = await invoke<BuildFileEntry>("upload_build_mod", {
        build: activeBuild,
        githubToken,
        filePath: path,
        targetName: null,
      });
      setManifest(prev => prev ? {
        ...prev,
        mods: [...prev.mods.filter(m => m.name !== entry.name), entry],
      } : prev);
      notify(`Мод ${entry.name} загружен. Нажмите «Сохранить manifest», чтобы он вошёл в сборку.`);

    } catch (e) {
      setMessage(String(e));
    } finally {
      setUploadingMod(false);
    }
  };

  const onDropMod = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    for (const file of files) {
      const path = (file as any).path || (file as any).webkitRelativePath;
      if (path) await uploadModPath(path);
    }
  };

  const commitManifest = async () => {
    if (!manifest) return;
    setSaving(true);
    setMessage("Отправляю manifest сборки на GitHub...");
    try {
      const result = await invoke<string>("commit_build_manifest", {
        build: activeBuild,
        githubToken,
        manifest,
      });
      setMessage(result);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel admin-panel">
      <h2 style={{ marginBottom: 10, fontWeight: 800, fontSize: 22 }}>Админ-панель</h2>

      <div className="admin-main-tabs">

        <button className={`admin-main-tab ${activeTab === "accounts" ? "active" : ""}`} onClick={() => setActiveTab("accounts")}>
          <span>Пароли</span>
          <small>Оффлайн-аккаунты игроков</small>
        </button>
        {isOwner && (
          <button className={`admin-main-tab ${activeTab === "builds" ? "active" : ""}`} onClick={() => setActiveTab("builds")}>
            <span>Сборки</span>
            <small>RPWorld и MiniGames: моды, версия, loader</small>
          </button>
        )}

      </div>

      <div className="admin-token-box">
        <div className="admin-account-name">GitHub token</div>
        <input
          className="admin-password-input"
          type="password"
          value={githubToken}
          onChange={e => saveToken(e.target.value)}
          placeholder="github_pat_... с Contents: Read and write"
        />
      </div>

      {activeTab === "accounts" && (
        <>
          <div className="admin-note">
            Здесь можно менять пароли, добавлять игроков и удалять старых. После подтверждения лаунчер сам зашифрует
            <b> public/auth/offline_accounts.rpwenc</b> и отправит commit в GitHub.
          </div>

          <div className="admin-add-box">
            <div className="admin-account-name">Добавить игрока</div>
            <input className="admin-password-input" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Ник" />
            <input className="admin-password-input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Пароль" />
            <button className="settings-btn" onClick={addAccount}>Добавить</button>
          </div>

          <div className="admin-account-list">
            {accounts.map((account, index) => {
              const visible = !!showPasswords[account.username];
              return (
                <div className="admin-account-row" key={account.username}>
                  <div className="admin-account-name">
                    {account.username}
                    {account.username.toLowerCase() === ADMIN_NAME.toLowerCase() && <span className="admin-mod-count" style={{ fontSize: 9, marginLeft: 6 }}>ВЫ</span>}
                  </div>
                  <input className="admin-password-input" type={visible ? "text" : "password"} value={account.password} onChange={e => updatePassword(index, e.target.value)} />
                  {isOwner && account.username.toLowerCase() !== ADMIN_NAME.toLowerCase() && (
                    <label className="admin-mod-enabled admin-role-toggle" title="Модератор может управлять пользователями, но не сборками">
                      <input
                        type="checkbox"
                        checked={(account.role || "").toLowerCase() === "moderator"}
                        onChange={e => setAccounts(prev => prev.map((row, i) => i === index ? { ...row, role: e.target.checked ? "moderator" : "" } : row))}
                      />
                      <span>Модер</span>
                    </label>
                  )}
                  <button className="settings-btn compact" onClick={() => setShowPasswords(prev => ({ ...prev, [account.username]: !visible }))}>{visible ? "Скрыть" : "Показать"}</button>
                  <button className="settings-btn danger compact" disabled={account.username.toLowerCase() === ADMIN_NAME.toLowerCase()} onClick={() => deleteAccount(account)}>Удалить</button>

                </div>
              );
            })}
          </div>
          <button className="settings-btn accent" onClick={commitChanges} disabled={saving || !githubToken.trim()}>{saving ? "Отправка..." : "Подтвердить и отправить commit"}</button>
        </>
      )}

      {activeTab === "builds" && isOwner && (

        <div className="admin-build-panel">
          <div className="admin-build-tabs">
            {BUILD_NAMES.map(build => (
              <button key={build} className={`admin-build-tab ${activeBuild === build ? "active" : ""}`} onClick={() => setActiveBuild(build)}>
                {build === "rpworld" ? "RPWorld" : "MiniGames"}
              </button>
            ))}
          </div>
          {!githubToken.trim() && <div className="admin-message">Введите GitHub token выше, чтобы загрузить настройки сборок.</div>}
          {githubToken.trim() && !manifest && <div className="admin-message">Загружаю manifest сборки...</div>}
          {manifest && (
            <>
              <div className="admin-download-dir-row">
                <div>
                  <div className="admin-account-name">Папка сохранения</div>
                  <div className="admin-download-dir-path">{downloadDir || "Не выбрана"}</div>
                </div>
                <button className="settings-btn compact" onClick={chooseDownloadDir}>Изменить</button>
              </div>

              <div className="admin-build-settings" style={{ marginBottom: 28 }}>
                <label>
                  Версия Minecraft
                  <select className="admin-password-input" value={manifest.minecraft_version} onChange={e => updateManifest({ minecraft_version: e.target.value })}>
                    {!availableVersions.includes(manifest.minecraft_version) && (
                      <option value={manifest.minecraft_version}>{manifest.minecraft_version}</option>
                    )}
                    {availableVersions.length > 0 ? (
                      availableVersions.map(v => <option key={v} value={v}>{v}</option>)
                    ) : (
                      <option value={manifest.minecraft_version}>{manifest.minecraft_version}</option>
                    )}
                  </select>
                </label>

                <label>Загрузчик<select className="admin-password-input" value={manifest.loader} onChange={e => updateManifest({ loader: e.target.value })}>{LOADERS.map(loader => <option key={loader} value={loader}>{loader}</option>)}</select></label>
                <label>Версия загрузчика<input className="admin-password-input" value={manifest.loader_version || ""} onChange={e => updateManifest({ loader_version: e.target.value })} placeholder="можно пусто = latest" /></label>
              </div>

              <div className="admin-drop-zone" onDragOver={e => e.preventDefault()} onDrop={onDropMod}>
                {uploadingMod ? "Загрузка мода на GitHub..." : "Перетащите .jar моды сюда или на список ниже, чтобы добавить в сборку"}
              </div>


              <div className="admin-mod-search">
                <input value={modSearch} onChange={e => setModSearch(e.target.value)} placeholder={`Поиск по модам... (всего: ${manifest.mods.length})`} />
              </div>

              <div className="admin-mod-list" onDragOver={e => e.preventDefault()} onDrop={onDropMod}>
                {manifest.mods
                  .map((mod, originalIndex) => ({ mod, originalIndex }))
                  .filter(({ mod }) => mod.name.toLowerCase().includes(modSearch.toLowerCase().trim()))
                  .map(({ mod, originalIndex }) => (
                  <div className="admin-mod-row" key={`${mod.name}-${mod.sha1}`}>
                    <input className="admin-password-input" value={mod.name} onChange={e => updateMod(originalIndex, { name: e.target.value, path: `mods/${e.target.value}`, url: mod.url.replace(/mods\/[^/]+$/, `mods/${encodeURIComponent(e.target.value)}`) })} />
                    <div className="admin-mod-meta">{formatSize(mod.size)}</div>
                    <label className="admin-mod-enabled"><input type="checkbox" checked={mod.enabled} onChange={e => updateMod(originalIndex, { enabled: e.target.checked })} /><span>Вкл.</span></label>
                    <button className="settings-btn compact" onClick={() => downloadMod(mod)}>Скачать</button>
                    <button className="settings-btn danger compact" onClick={() => deleteMod(mod)}>Удалить</button>
                  </div>
                ))}
              </div>

              <div className="admin-build-floating-actions">
                <button className="settings-btn" onClick={downloadBuild}>Скачать сборку</button>
                <button className="settings-btn accent" onClick={commitManifest} disabled={saving || !githubToken.trim()}>{saving ? "Отправка..." : "Подтвердить и отправить commit"}</button>
              </div>
            </>
          )}
        </div>
      )}

      {message && <div className="admin-message">{message}</div>}
      {toast && <div className="notification admin-toast">{toast}</div>}
    </div>

  );
}
