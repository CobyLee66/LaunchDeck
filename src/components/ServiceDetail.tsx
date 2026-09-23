import { useCallback, useEffect, useState } from "react";
import {
  ServiceDetail as Detail,
  serviceDetail,
  startService,
  stopService,
  restartService,
  deleteService,
} from "../api";
import ConfirmModal from "./ConfirmModal";

interface Props {
  domain: string;
  label: string;
  onBack: () => void;
}

export default function ServiceDetail({ domain, label, onBack }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const loadDetail = useCallback(() => {
    serviceDetail(domain, label)
      .then(setDetail)
      .catch((e) => setError(String(e)));
  }, [domain, label]);

  useEffect(loadDetail, [loadDetail]);

  const showToast = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const doAction = async (action: "start" | "stop" | "restart") => {
    if (!detail) return;
    const s = detail.info;
    setBusy(true);
    try {
      if (action === "start") await startService(s.domain, s.label, s.plist_path);
      else if (action === "stop") await stopService(s.domain, s.label);
      else await restartService(s.domain, s.label, s.plist_path);
      showToast("ok", `${action} 成功`);
      loadDetail();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(loadDetail, 3000);
    } catch (e) {
      showToast("err", `${action} 失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!info) return;
    setConfirmDel(false);
    setBusy(true);
    try {
      await deleteService(info.domain, info.label, info.plist_path!);
      // 删除成功直接返回列表（列表会重新加载，服务已消失即为反馈）
      onBack();
    } catch (e) {
      showToast("err", `删除 ${info.label} 失败: ${e}`);
      setBusy(false);
    }
  };

  const info = detail?.info;

  return (
    <div className="page">
      <div className="detail-head">
        <button className="btn" onClick={onBack}>
          ← 返回
        </button>
        <h1 className="detail-title">{label}</h1>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">加载失败: {error}</div>}
      {info && (
        <>
          <section>
            <h2>基本信息</h2>
            <table className="kv">
              <tbody>
                <tr><td>Label</td><td>{info.label}</td></tr>
                <tr><td>域</td><td>{info.domain}</td></tr>
                <tr>
                  <td>状态</td>
                  <td>{info.running ? `运行中${info.pid ? ` (PID ${info.pid})` : ""}` : "已停止"}</td>
                </tr>
                <tr><td>上次退出码</td><td>{info.last_exit_code ?? "-"}</td></tr>
                <tr><td>RunAtLoad</td><td>{info.run_at_load ? "是" : "否"}</td></tr>
                <tr><td>KeepAlive</td><td>{info.keep_alive ? "是" : "否"}</td></tr>
                <tr><td>来源</td><td>{info.is_system ? "Apple 系统" : "第三方"}</td></tr>
                <tr><td>plist 路径</td><td className="mono">{info.plist_path ?? "-"}</td></tr>
                <tr><td>程序</td><td className="mono">{info.program ?? "-"}</td></tr>
              </tbody>
            </table>
            <div className="ops">
              <button className="btn" disabled={busy || info.running} onClick={() => doAction("start")}>
                启动
              </button>
              <button className="btn" disabled={busy || !info.running} onClick={() => doAction("stop")}>
                停止
              </button>
              <button className="btn" disabled={busy} onClick={() => doAction("restart")}>
                重启
              </button>
              <button
                className="btn danger"
                disabled={busy || info.is_system || !info.plist_path}
                title={
                  info.is_system
                    ? "系统自带服务受 SIP 保护，不可删除"
                    : info.plist_path
                      ? "删除并备份此服务"
                      : "未找到 plist 文件，无法删除"
                }
                onClick={() => setConfirmDel(true)}
              >
                删除
              </button>
            </div>
          </section>
          <section>
            <h2>plist 字段</h2>
            {detail!.plist_keys.length === 0 ? (
              <div className="empty">（无 plist 文件）</div>
            ) : (
              <table className="kv">
                <tbody>
                  {detail!.plist_keys.map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="mono">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <h2>launchctl print {domain}/{label}</h2>
            <pre className="raw">{detail!.raw_print || "（无输出）"}</pre>
          </section>
        </>
      )}
      {confirmDel && info && (
        <ConfirmModal
          title="删除服务"
          message={`确定删除服务 ${info.label} 吗？\n将停止服务并把 ${info.plist_path} 备份到本机，之后可在「备份管理」中恢复。`}
          confirmText="删除"
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}
