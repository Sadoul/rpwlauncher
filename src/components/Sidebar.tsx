import { motion, AnimatePresence } from "framer-motion";
import { FiGlobe, FiZap, FiSettings, FiLogOut } from "react-icons/fi";

export type Page = "rpworld" | "minigames" | "settings";

interface Account {
  username: string;
  uuid: string;
  access_token: string;
  account_type: string;
}

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  account: Account | null;
  onLogout: () => void;
}

const navItems: { id: Page; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: "rpworld",
    label: "RPWorld",
    icon: <FiGlobe />,
    description: "Ролевой мир",
  },
  {
    id: "minigames",
    label: "Мини-игры",
    icon: <FiZap />,
    description: "Мини-игры",
  },
];

export default function Sidebar({ currentPage, onPageChange, account, onLogout }: SidebarProps) {
  return (
    <motion.div
      className="sidebar"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Logo */}
      <div className="sidebar-logo">
        <motion.h1
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          RPW
        </motion.h1>
        <motion.div
          className="subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Launcher
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <AnimatePresence>
          {navItems.map((item, index) => (
            <motion.div
              key={item.id}
              className={`nav-item ${currentPage === item.id ? "active" : ""}`}
              onClick={() => onPageChange(item.id)}
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 * (index + 1), duration: 0.3 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="icon">{item.icon}</span>
              <div>
                <div>{item.label}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="nav-divider" />

        <motion.div
          className={`nav-item ${currentPage === "settings" ? "active" : ""}`}
          onClick={() => onPageChange("settings")}
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
        >
          <span className="icon"><FiSettings /></span>
          <div>Настройки</div>
        </motion.div>
      </nav>

      {/* User info */}
      {account && (
        <motion.div
          className="sidebar-footer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <div className="user-info" onClick={onLogout} title="Нажмите для выхода">
            <div className="user-avatar">
              {account.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <div className="user-name">{account.username}</div>
              <div className="user-type">
                {account.account_type === "microsoft" ? "Microsoft" : "Офлайн"}
              </div>
            </div>
            <FiLogOut style={{ marginLeft: "auto", opacity: 0.5, flexShrink: 0 }} />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
