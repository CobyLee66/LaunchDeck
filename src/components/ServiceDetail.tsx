import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ServiceDetail as Detail,
  serviceDetail,
  startService,
  stopService,
  restartService,
  deleteService,
} from "../api";
import ConfirmModal from "./ConfirmModal";

const ACTION_OK_KEY: Record<"start" | "stop" | "restart", string> = {
  start: "toast.startOk",
  stop: "toast.stopOk",
  restart: "toast.restartOk",
};

interface Props {
  domain: string;
  label: string;
  onBack: () => void;
}

export default function ServiceDetail({ domain, label, onBack }: Props) {
  const { t } = useTranslation();
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
      showToast("ok", t(ACTION_OK_KEY[action], { label: s.label }));
      loadDetail();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(loadDetail, 3000);
    } catch (e) {
      showToast(
        "err",
        t("common.actionFailed", { action: t(`actions.${action}`), message: String(e) })
      );
    } finally {
      setBusy(false);
    }
  };

  const info = detail?.info;

  const doDelete = async () => {
    if (!info) return;
    setConfirmDel(false);
    setBusy(true);
    try {
      await deleteService(info.domain, info.label, info.plist_path!);
      // 删除成功直接返回列表（列表会重新加载，服务已消失即为反馈）
      onBack();
    } catch (e) {
      showToast("err", t("toast.deleteFailed", { label: info.label, message: String(e) }));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="detail-head">
        <button className="btn" onClick={onBack}>
          {t("detail.back")}
        </button>
        <h1 className="detail-title">{label}</h1>
      </div>
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">{t("common.loadFailed", { message: error })}</div>}
      {info && (
        <>
          <section>
            <h2>{t("detail.basicInfo")}</h2>
            <table className="kv">
              <tbody>
                <tr><td>Label</td><td>{info.label}</td></tr>
                <tr><td>{t("detail.domain")}</td><td>{info.domain}</td></tr>
                <tr>
                  <td>{t("detail.status")}</td>
                  <td>
                    {info.running
                      ? `${t("common.running")}${info.pid ? ` (PID ${info.pid})` : ""}`
                      : t("common.stopped")}
                  </td>
                </tr>
                <tr><td>{t("detail.lastExit")}</td><td>{info.last_exit_code ?? "-"}</td></tr>
                <tr><td>RunAtLoad</td><td>{info.run_at_load ? t("common.yes") : t("common.no")}</td></tr>
                <tr><td>KeepAlive</td><td>{info.keep_alive ? t("common.yes") : t("common.no")}</td></tr>
                <tr>
                  <td>{t("detail.source")}</td>
                  <td>{info.is_system ? t("detail.sourceSystem") : t("detail.sourceThirdparty")}</td>
                </tr>
                <tr><td>{t("detail.plistPath")}</td><td className="mono">{info.plist_path ?? "-"}</td></tr>
                <tr><td>{t("detail.program")}</td><td className="mono">{info.program ?? "-"}</td></tr>
              </tbody>
            </table>
            <div className="ops">
              <button className="btn" disabled={busy || info.running} onClick={() => doAction("start")}>
                {t("actions.start")}
              </button>
              <button className="btn" disabled={busy || !info.running} onClick={() => doAction("stop")}>
                {t("actions.stop")}
              </button>
              <button className="btn" disabled={busy} onClick={() => doAction("restart")}>
                {t("actions.restart")}
              </button>
              <button
                className="btn danger"
                disabled={busy || info.is_system || !info.plist_path}
                title={
                  info.is_system
                    ? t("list.delSipTitle")
                    : info.plist_path
                      ? t("list.delTitle")
                      : t("list.delNoPlistTitle")
                }
                onClick={() => setConfirmDel(true)}
              >
                {t("actions.delete")}
              </button>
            </div>
          </section>
          <section>
            <h2>{t("detail.plistKeys")}</h2>
            {detail!.plist_keys.length === 0 ? (
              <div className="empty">{t("detail.noPlist")}</div>
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
            <pre className="raw">{detail!.raw_print || t("detail.noOutput")}</pre>
          </section>
        </>
      )}
      {confirmDel && info && (
        <ConfirmModal
          title={t("confirmDeleteService.title")}
          message={t("confirmDeleteService.message", {
            label: info.label,
            path: info.plist_path,
          })}
          confirmText={t("confirmDeleteService.confirm")}
          danger
          onConfirm={doDelete}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </div>
  );
}
