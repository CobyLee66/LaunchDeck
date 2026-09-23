import { useCallback, useEffect, useState } from "react";
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
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  successText: string;
  run: () => Promise<void>;
}

export default function BackupManager({ onBack }: Props) {
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
    const { busyKey, run, successText, confirmText } = confirm;
    setConfirm(null);
    setBusy(busyKey);
    try {
      await run();
      showToast("ok", successText);
      refresh();
    } catch (e) {
      showToast("err", `${confirmText}失败: ${e}`);
    } finally {
      setBusy(null);
    }
  };

  const askRestore = (b: BackupInfo) =>
    setConfirm({
      busyKey: b.id,
      title: "恢复备份",
      message: `将把 ${b.label} 的 plist 恢复到原位置：\n${b.original_path}\n恢复后不会自动启动，可在服务列表中手动启动。`,
      confirmText: "恢复",
      danger: false,
      successText: `已恢复 ${b.label}`,
      run: () => restoreBackup(b.id),
    });

  const askDelete = (b: BackupInfo) =>
    setConfirm({
      busyKey: b.id,
      title: "删除备份",
      message: `确定删除 ${b.label} 的这条备份吗？\n删除后该备份无法恢复。`,
      confirmText: "删除",
      danger: true,
      successText: `已删除备份 ${b.label}`,
      run: () => deleteBackup(b.id),
    });

  const askClear = () =>
    setConfirm({
      busyKey: "clear",
      title: "清空备份",
      message: `确定清空全部 ${backups.length} 条备份吗？\n删除后无法恢复。`,
      confirmText: "清空",
      danger: true,
      successText: "已清空全部备份",
      run: () => clearBackups(),
    });

  return (
    <div className="page">
      <div className="page-head">
        <h1>备份管理</h1>
        <div className="ops" style={{ marginTop: 0 }}>
          <button className="btn" onClick={onBack}>
            ← 返回列表
          </button>
          <button
            className="btn danger"
            disabled={loading || backups.length === 0 || busy !== null}
            onClick={askClear}
          >
            清空备份
          </button>
        </div>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">加载失败: {error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th style={{ width: 60 }}>域</th>
              <th>原 plist 路径</th>
              <th style={{ width: 160 }}>删除时间</th>
              <th style={{ width: 130 }}>操作</th>
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
                <td>{new Date(b.deleted_at_ms).toLocaleString()}</td>
                <td>
                  <div className="ops" style={{ marginTop: 0 }}>
                    <button className="btn" disabled={busy !== null} onClick={() => askRestore(b)}>
                      恢复
                    </button>
                    <button
                      className="btn danger"
                      disabled={busy !== null}
                      onClick={() => askDelete(b)}
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && backups.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  暂无备份（删除服务时会自动生成）
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="footer">{loading ? "加载中…" : `共 ${backups.length} 条备份`}</div>
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
