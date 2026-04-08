import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";

interface Account {
  username: string;
  uuid: string;
  access_token: string;
  account_type: string;
}

interface AuthPanelProps {
  onLogin: (account: Account) => void;
}

type AuthMode = "offline" | "microsoft";

export default function AuthPanel({ onLogin }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("offline");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleOfflineLogin = async () => {
    if (!username.trim() || username.length < 3) {
      setError("Никнейм должен быть минимум 3 символа");
      return;
    }
    if (username.length > 16) {
      setError("Никнейм не может быть длиннее 16 символов");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError("Только латинские буквы, цифры и _");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const account = await invoke<Account>("login_offline", { username: username.trim() });
      onLogin(account);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const account = await invoke<Account>("login_microsoft");
      onLogin(account);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="auth-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <motion.div
        className="auth-title"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        Добро пожаловать в RPWorld
      </motion.div>

      <motion.div
        className="auth-subtitle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        Войдите, чтобы начать играть
      </motion.div>

      <motion.div
        className="auth-tabs"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        <button
          className={`auth-tab ${mode === "offline" ? "active" : ""}`}
          onClick={() => { setMode("offline"); setError(""); }}
        >
          Офлайн
        </button>
        <button
          className={`auth-tab ${mode === "microsoft" ? "active" : ""}`}
          onClick={() => { setMode("microsoft"); setError(""); }}
        >
          Microsoft
        </button>
      </motion.div>

      <AnimatePresence mode="wait">
        {mode === "offline" ? (
          <motion.div
            key="offline"
            className="auth-form"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.25 }}
          >
            <div className="input-group">
              <label>Никнейм</label>
              <input
                type="text"
                placeholder="Введите никнейм..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOfflineLogin()}
                maxLength={16}
                autoFocus
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{ color: "var(--accent-red)", fontSize: "13px", textAlign: "center" }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              className="auth-button"
              onClick={handleOfflineLogin}
              disabled={loading || !username.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Вход...
                </span>
              ) : (
                "Войти"
              )}
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="microsoft"
            className="auth-form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                style={{
                  color: "var(--accent-orange)",
                  fontSize: "13px",
                  textAlign: "center",
                  padding: "12px",
                  background: "rgba(245, 158, 11, 0.1)",
                  borderRadius: "8px",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  lineHeight: "1.5",
                }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              className="auth-button microsoft"
              onClick={handleMicrosoftLogin}
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                  Авторизация...
                </span>
              ) : (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="1" width="6.5" height="6.5" />
                    <rect x="8.5" y="1" width="6.5" height="6.5" />
                    <rect x="1" y="8.5" width="6.5" height="6.5" />
                    <rect x="8.5" y="8.5" width="6.5" height="6.5" />
                  </svg>
                  Войти через Microsoft
                </span>
              )}
            </motion.button>

            <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", lineHeight: "1.5" }}>
              Откроется браузер для авторизации через ваш аккаунт Microsoft
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
