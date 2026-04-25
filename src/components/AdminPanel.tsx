import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AccountRow {
  username: string;
  password: string;
}

interface Props {
  username: string;
}

export default function AdminPanel({ username }: Props) {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [encrypted, setEncrypted] = useState("");
  const [message, setMessage] = useState("");

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

  const generateEncrypted = async () => {
    try {
      const payload = await invoke<string>("encrypt_admin_accounts", { accounts });
      setEncrypted(payload);
      await navigator.clipboard.writeText(payload).catch(() => undefined);
      setMessage("Зашифрованный файл сгенерирован и скопирован. Вставь его в public/auth/offline_accounts.rpwenc и сделай коммит.");
    } catch (e) {
      setMessage(String(e));
    }
  };

  return (
    <div className="settings-panel admin-panel">
      <h2 style={{ marginBottom: 10, fontWeight: 800, fontSize: 22 }}>Админ-панель</h2>
      <div className="admin-note">
        Пароль Sadoul скрыт. Остальные пароли можно менять здесь. После подтверждения лаунчер генерирует новый зашифрованный файл.
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

      <button className="settings-btn accent" onClick={generateEncrypted}>
        Подтвердить изменения
      </button>
      {message && <div className="admin-message">{message}</div>}
      {encrypted && (
        <textarea className="admin-encrypted-output" readOnly value={encrypted} />
      )}
    </div>
  );
}
