import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AccountRow {
  username: string;
  password: string;
}

interface Props {
  username: string;
}

const ADMIN_NAME = "Sadoul";

export default function AdminPanel({ username }: Props) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    load();
    loadToken();
  }, []);

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

  const updatePassword = (index: number, password: string) => {
    setAccounts(prev => prev.map((row, i) => i === index ? { ...row, password } : row));
  };

  const saveToken = async (token: string) => {
    setGithubToken(token);
    try {
      await invoke("save_admin_token", { currentUsername: username, githubToken: token });
    } catch {
      // token will still stay in state until restart
    }
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
    setMessage(`Игрок ${nextUsername} добавлен локально. Нажмите подтверждение, чтобы отправить commit.`);
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

  return (
    <div className="settings-panel admin-panel">
      <h2 style={{ marginBottom: 10, fontWeight: 800, fontSize: 22 }}>Админ-панель</h2>
      <div className="admin-note">
        Здесь можно менять пароли, добавлять игроков и удалять старых. После подтверждения лаунчер сам зашифрует
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

      <div className="admin-add-box">
        <div className="admin-account-name">Добавить игрока</div>
        <input
          className="admin-password-input"
          value={newUsername}
          onChange={e => setNewUsername(e.target.value)}
          placeholder="Ник"
        />
        <input
          className="admin-password-input"
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          placeholder="Пароль"
        />
        <button className="settings-btn" onClick={addAccount}>Добавить</button>
      </div>

      <div className="admin-account-list">
        {accounts.map((account, index) => {
          const visible = !!showPasswords[account.username];
          return (
            <div className="admin-account-row" key={account.username}>
              <div className="admin-account-name">{account.username}</div>
              <input
                className="admin-password-input"
                type={visible ? "text" : "password"}
                value={account.password}
                onChange={e => updatePassword(index, e.target.value)}
              />
              <button
                className="settings-btn compact"
                onClick={() => setShowPasswords(prev => ({ ...prev, [account.username]: !visible }))}
              >
                {visible ? "Скрыть" : "Показать"}
              </button>
              <button
                className="settings-btn danger compact"
                disabled={account.username.toLowerCase() === ADMIN_NAME.toLowerCase()}
                onClick={() => deleteAccount(account)}
              >
                Удалить
              </button>
            </div>
          );
        })}
      </div>

      <button className="settings-btn accent" onClick={commitChanges} disabled={saving || !githubToken.trim()}>
        {saving ? "Отправка..." : "Подтвердить и отправить commit"}
      </button>
      {message && <div className="admin-message">{message}</div>}
    </div>
  );
}
