import { useCallback, useEffect, useState } from "react";
import {
  ServiceDetail as Detail,
  serviceDetail,
  startService,
  stopService,
  restartService,
} from "../api";

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
    } catch (e) {
      showToast("err", `${action} 失败: ${e}`);
    } finally {
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
    </div>
  );
}
