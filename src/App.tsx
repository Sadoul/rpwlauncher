import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import Titlebar from "./components/Titlebar";
import Sidebar, { type Page } from "./components/Sidebar";
import ParticlesBg from "./components/ParticlesBg";
import AuthPanel from "./components/AuthPanel";
import GamePanel from "./components/GamePanel";
import SettingsPanel from "./components/SettingsPanel";

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
}

const STORAGE_KEYS = {
  memory: "rpw_memory",
  javaPath: "rpw_java_path",
  javaVersion: "rpw_java_version",
} as const;

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>("rpworld");
  const [loading, setLoading] = useState(true);
  const [javaPath, setJavaPath] = useState("");
  const [javaVersion, setJavaVersion] = useState("");
  const [maxMemory, setMaxMemory] = useState(4096);
  const [notification, setNotification] = useState("");

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.memory, String(maxMemory));
  }, [maxMemory]);

  const initializeApp = async () => {
    try {
      // Load saved settings
      const savedMemory = localStorage.getItem(STORAGE_KEYS.memory);
      const savedJavaPath = localStorage.getItem(STORAGE_KEYS.javaPath);
      const savedJavaVersion = localStorage.getItem(STORAGE_KEYS.javaVersion);

      if (savedMemory) {
        const memory = parseInt(savedMemory);
        if (!isNaN(memory)) {
          setMaxMemory(Math.max(1024, Math.min(32768, memory)));
        }
      }

      if (savedJavaPath) setJavaPath(savedJavaPath);
      if (savedJavaVersion) setJavaVersion(savedJavaVersion);

      // Check saved account
      const savedAccount = await invoke<Account | null>("get_saved_account");
      if (savedAccount) {
        setAccount(savedAccount);
      }

      // Auto-find Java if not saved
      if (!savedJavaPath) {
        try {
          const javaInfo = await invoke<JavaInfo>("find_java");
          if (javaInfo.found) {
            handleJavaChange(javaInfo.path, javaInfo.version);
          }
        } catch {
          // ignore java detection errors on startup
        }
      }

      // Check launcher updates
      try {
        const updateInfo = await invoke<UpdateInfo>("check_launcher_update");
        if (updateInfo.update_available) {
          setNotification(
            `Доступно обновление ${updateInfo.latest_version}. Откройте настройки для обновления.`
          );
          setTimeout(() => setNotification(""), 7000);
        }
      } catch {
        // ignore update errors
      }
    } catch (error) {
      console.error("Failed to initialize app:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (newAccount: Account) => {
    setAccount(newAccount);
    setNotification(`Добро пожаловать, ${newAccount.username}!`);
    setTimeout(() => setNotification(""), 3000);
  };

  const handleLogout = async () => {
    try {
      await invoke("logout");
      setAccount(null);
      setNotification("Вы вышли из аккаунта");
      setTimeout(() => setNotification(""), 3000);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleJavaChange = (path: string, version: string) => {
    setJavaPath(path);
    setJavaVersion(version);
    localStorage.setItem(STORAGE_KEYS.javaPath, path);
    localStorage.setItem(STORAGE_KEYS.javaVersion, version);
  };

  if (loading) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ParticlesBg />
        <motion.div
          style={{
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
          <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>Загрузка RPWorld Launcher...</div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <ParticlesBg />

      <Titlebar />

      <div className="main-layout" style={{ position: "relative", zIndex: 1 }}>
        <Sidebar
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          account={account}
          onLogout={handleLogout}
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
                    onJavaChange={handleJavaChange}
                    onMemoryChange={setMaxMemory}
                  />
                </motion.div>
              ) : (
                <GamePanel
                  key={currentPage}
                  page={currentPage}
                  account={account}
                  javaPath={javaPath}
                  maxMemory={maxMemory}
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
            initial={{ opacity: 0, y: 20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 20, x: 20 }}
            transition={{ duration: 0.25 }}
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
