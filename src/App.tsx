import { useEffect, useLayoutEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import Titlebar from "./components/Titlebar";
import Sidebar, { type Page } from "./components/Sidebar";
import ParticlesBg from "./components/ParticlesBg";
import AuthPanel from "./components/AuthPanel";
import GamePanel from "./components/GamePanel";
import SettingsPanel from "./components/SettingsPanel";
import CustomModpackPanel from "./components/CustomModpackPanel";
import UpdateOverlay from "./components/UpdateOverlay";

interface Account {
  username: string;
  uuid: string;
  access_token: string;
  account_type: string;
}

interface JavaInfo {
  path: string;
  version: string;
  found: boolean;
}

interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string;
  installer_url: string;
  release_notes: string;
  file_size: number;
}

type Theme = "light" | "dark";

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>("rpworld");
  const [loading, setLoading] = useState(true);
  const [javaPath, setJavaPath] = useState("");
  const [javaVersion, setJavaVersion] = useState("");
  const [maxMemory, setMaxMemory] = useState(4096);
  const [jvmArgs, setJvmArgs] = useState("");
  const [gpuMode, setGpuMode] = useState("auto");
  const [theme, setTheme] = useState<Theme>("light");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [notification, setNotification] = useState("");
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);

  // useLayoutEffect runs synchronously before paint — ensures all CSS variables
  // change in the same frame, so background + widgets transition simultaneously
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rpw_theme", theme);
  }, [theme]);

  useEffect(() => { initializeApp(); }, []);

  const initializeApp = async () => {
    try {
      const savedMemory = localStorage.getItem("rpw_memory");
      const savedJavaPath = localStorage.getItem("rpw_java_path");
      const savedJavaVersion = localStorage.getItem("rpw_java_version");
      const savedJvmArgs = localStorage.getItem("rpw_jvm_args");
      const savedGpuMode = localStorage.getItem("rpw_gpu_mode");
      const savedTheme = localStorage.getItem("rpw_theme") as Theme | null;

      if (savedMemory) { const m = parseInt(savedMemory); if (!isNaN(m)) setMaxMemory(Math.max(1024, Math.min(16384, m))); }
      if (savedJavaPath) setJavaPath(savedJavaPath);
      if (savedJavaVersion) setJavaVersion(savedJavaVersion);
      if (savedJvmArgs) setJvmArgs(savedJvmArgs);
      if (savedGpuMode) setGpuMode(savedGpuMode);
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);

      try { const url = await invoke<string | null>("get_avatar"); if (url) setAvatarUrl(url); } catch { /* ignore */ }

      const savedAccount = await invoke<Account | null>("get_saved_account");
      if (savedAccount) setAccount(savedAccount);

      if (!savedJavaPath) {
        try { const j = await invoke<JavaInfo>("find_java"); if (j.found) handleJavaChange(j.path, j.version); } catch { /* ignore */ }
      }

      try {
        // Skip update check if we just ran an NSIS update (breaks the infinite-loop bug)
        const justUpdated = await invoke<boolean>("check_just_updated").catch(() => false);
        if (!justUpdated) {
          const updateInfo = await invoke<UpdateInfo>("check_launcher_update");
          if (updateInfo.update_available) setPendingUpdate(updateInfo);
        }
      } catch { /* ignore */ }
    } catch (e) {
      console.error("Init failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => {
    setTheme(t => t === "light" ? "dark" : "light");
  };

  const handleLogin = (acc: Account) => {
    setAccount(acc);
    showNotification(`Добро пожаловать, ${acc.username}`);
  };

  const handleLogout = async () => {
    try { await invoke("logout"); setAccount(null); showNotification("Вы вышли из аккаунта"); } catch { /* ignore */ }
  };

  const handleJavaChange = (path: string, version: string) => {
    setJavaPath(path); setJavaVersion(version);
    localStorage.setItem("rpw_java_path", path);
    localStorage.setItem("rpw_java_version", version);
  };

  const handleMemoryChange = (mem: number) => {
    setMaxMemory(mem);
    localStorage.setItem("rpw_memory", String(mem));
  };

  const handleJvmArgsChange = (args: string) => {
    setJvmArgs(args);
    localStorage.setItem("rpw_jvm_args", args);
  };

  const handleGpuModeChange = (mode: string) => {
    setGpuMode(mode);
    localStorage.setItem("rpw_gpu_mode", mode);
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3500);
  };

  if (loading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ParticlesBg />
        <motion.div
          style={{ zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.img
            src="/icons/launcher.png"
            alt="RPWorld"
            style={{ width: 72, height: 72, borderRadius: "18px", objectFit: "cover" }}
            animate={{ boxShadow: ["0 0 20px rgba(212,121,58,0.3)", "0 0 50px rgba(212,121,58,0.6)", "0 0 20px rgba(212,121,58,0.3)"] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Загрузка...</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <ParticlesBg />

      <AnimatePresence>
        {pendingUpdate && (
          <UpdateOverlay
            updateInfo={pendingUpdate}
            onSkip={() => setPendingUpdate(null)}
          />
        )}
      </AnimatePresence>

      <Titlebar theme={theme} onThemeToggle={toggleTheme} />

      <div className="main-layout" style={{ position: "relative", zIndex: 1 }}>
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          account={account}
          onLogout={handleLogout}
          avatarUrl={avatarUrl}
        />

        <div className="content-area">
          {!account ? (
            <motion.div
              className="game-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <AuthPanel onLogin={handleLogin} />
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              {currentPage === "settings" ? (
                <motion.div
                  key="settings"
                  className="game-panel"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <SettingsPanel
                    javaPath={javaPath}
                    javaVersion={javaVersion}
                    maxMemory={maxMemory}
                    jvmArgs={jvmArgs}
                    gpuMode={gpuMode}
                    theme={theme}
                    avatarUrl={avatarUrl}
                    username={account.username}
                    onJavaChange={handleJavaChange}
                    onMemoryChange={handleMemoryChange}
                    onJvmArgsChange={handleJvmArgsChange}
                    onGpuModeChange={handleGpuModeChange}
                    onThemeChange={setTheme}
                    onAvatarChange={setAvatarUrl}
                  />
                </motion.div>
              ) : currentPage === "custom" ? (
                <CustomModpackPanel key="custom" />
              ) : (
                <GamePanel
                  key={currentPage}
                  page={currentPage}
                  account={account}
                  javaPath={javaPath}
                  maxMemory={maxMemory}
                  jvmArgs={jvmArgs}
                  gpuMode={gpuMode}
                />
              )}
            </AnimatePresence>
          )}
        </div>
      </div>

      <AnimatePresence>
        {notification && (
          <motion.div
            className="notification"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
