import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AccountRow {
  username: string;
  password: string;
}

interface Props {
  username: string;
}

const TOKEN_STORAGE_KEY = "rpw_admin_github_token";

export default function AdminPanel({ username }: Props) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const list = await invoke<AccountRow[]>("get_admin_accounts", { currentUsername: username });
      setAccounts(list);
    } catch (e) {
      setMessage(String(e));
    }
  };

  const updatePassword = (index: number, password: string) => {
    setAccounts(prev => prev.map((row, i) => i === index ? { ...row, password } : row));
  };

  const saveToken = (token: string) => {
    setGithubToken(token);
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
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
      await load();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel admin-panel">
      <h2 style={{ marginBottom: 10, fontWeight: 800, fontSize: 22 }}>Админ-панель</h2>
      <div className="admin-note">
        Пароль Sadoul скрыт. Остальные пароли можно менять здесь. После подтверждения лаунчер сам зашифрует файл
        <b> public/auth/offline_accounts.rpwenc</b> и отправит commit в GitHub.
      </div>

      <div className="admin-token-box">
        <div className="admin-account-name">GitHub token</div>
        <input
          className="admin-password-input"
          type="password"
          value={githubToken}
          onChange={e => saveToken(e.target.value)}
          placeholder="github_pat_... или classic token с Contents: Read and write"
        />
      </div>

      <div className="admin-account-list">
        {accounts.map((account, index) => (
          <div className="admin-account-row" key={account.username}>
            <div className="admin-account-name">{account.username}</div>
            <input
              className="admin-password-input"
              value={account.password}
              onChange={e => updatePassword(index, e.target.value)}
            />
          </div>
        ))}
      </div>

      <button className="settings-btn accent" onClick={commitChanges} disabled={saving || !githubToken.trim()}>
        {saving ? "Отправка..." : "Подтвердить и отправить commit"}
      </button>
      {message && <div className="admin-message">{message}</div>}
    </div>
  );
}
