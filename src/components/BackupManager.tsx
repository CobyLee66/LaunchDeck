import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BackupInfo,
  listBackups,
  restoreBackup,
  deleteBackup,
  clearBackups,
} from "../api";
import ConfirmModal from "./ConfirmModal";

interface Props {
  onBack: () => void;
}

interface ConfirmState {
  busyKey: string;
  /** 失败 toast 里的动作名（已翻译） */
  action: string;
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  successText: string;
  run: () => Promise<void>;
}

export default function BackupManager({ onBack }: Props) {
  const { t, i18n } = useTranslation();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 备份 id 或 "clear"
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listBackups()
      .then(setBackups)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const showToast = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const doConfirmed = async () => {
    if (!confirm) return;
    const { busyKey, run, successText, action } = confirm;
    setConfirm(null);
    setBusy(busyKey);
    try {
      await run();
      showToast("ok", successText);
      refresh();
    } catch (e) {
      showToast("err", t("common.actionFailed", { action, message: String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const askRestore = (b: BackupInfo) =>
    setConfirm({
      busyKey: b.id,
      action: t("backup.actionRestore"),
      title: t("backup.restoreTitle"),
      message: t("backup.restoreMessage", { label: b.label, path: b.original_path }),
      confirmText: t("backup.actionRestore"),
      danger: false,
      successText: t("backup.restoreOk", { label: b.label }),
      run: () => restoreBackup(b.id),
    });

  const askDelete = (b: BackupInfo) =>
    setConfirm({
      busyKey: b.id,
      action: t("backup.actionDelete"),
      title: t("backup.deleteTitle"),
      message: t("backup.deleteMessage", { label: b.label }),
      confirmText: t("backup.actionDelete"),
      danger: true,
      successText: t("backup.deleteOk", { label: b.label }),
      run: () => deleteBackup(b.id),
    });

  const askClear = () =>
    setConfirm({
      busyKey: "clear",
      action: t("backup.actionClear"),
      title: t("backup.clearTitle"),
      message: t("backup.clearMessage", { count: backups.length }),
      confirmText: t("backup.actionClear"),
      danger: true,
      successText: t("backup.clearOk"),
      run: () => clearBackups(),
    });

  // 日期格式跟随当前界面语言
  const formatTime = (ms: number) =>
    new Date(ms).toLocaleString(i18n.language === "zh-CN" ? "zh-CN" : "en-US");

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("backup.title")}</h1>
        <div className="ops" style={{ marginTop: 0 }}>
          <button className="btn" onClick={onBack}>
            {t("backup.back")}
          </button>
          <button
            className="btn danger"
            disabled={loading || backups.length === 0 || busy !== null}
            onClick={askClear}
          >
            {t("backup.clear")}
          </button>
        </div>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">{t("common.loadFailed", { message: error })}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th style={{ width: 60 }}>{t("backup.colDomain")}</th>
              <th>{t("backup.colOriginalPath")}</th>
              <th style={{ width: 160 }}>{t("backup.colDeletedAt")}</th>
              <th style={{ width: 130 }}>{t("backup.colOps")}</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td className="label-cell">{b.label}</td>
                <td>{b.domain}</td>
                <td className="mono" title={b.original_path}>
                  {b.original_path}
                </td>
                <td>{formatTime(b.deleted_at_ms)}</td>
                <td>
                  <div className="ops" style={{ marginTop: 0 }}>
                    <button className="btn" disabled={busy !== null} onClick={() => askRestore(b)}>
                      {t("backup.actionRestore")}
                    </button>
                    <button
                      className="btn danger"
                      disabled={busy !== null}
                      onClick={() => askDelete(b)}
                    >
                      {t("backup.actionDelete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  {t("backup.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="footer">
        {loading ? t("common.loading") : t("backup.count", { count: backups.length })}
      </div>
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmText={confirm.confirmText}
          danger={confirm.danger}
          onConfirm={doConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
