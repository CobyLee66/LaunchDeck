import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { load } from "@tauri-apps/plugin-store";
import {
  ServiceInfo,
  listServices,
  startService,
  stopService,
  restartService,
  deleteService,
} from "../api";
import { LanguagePref, loadLanguagePref, saveLanguagePref } from "../i18n";
import FilterBar, { Filters } from "./FilterBar";
import ConfirmModal from "./ConfirmModal";

const STORE_KEY = "favorites";

const ACTION_OK_KEY: Record<"start" | "stop" | "restart", string> = {
  start: "toast.startOk",
  stop: "toast.stopOk",
  restart: "toast.restartOk",
};

interface Props {
  onOpenDetail: (s: ServiceInfo) => void;
  onOpenBackups: () => void;
}

export default function ServiceList({ onOpenDetail, onOpenBackups }: Props) {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // `${domain}/${label}`
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<ServiceInfo | null>(null);
  const [langPref, setLangPref] = useState<LanguagePref>("auto");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    source: "thirdparty",
    status: "all",
    autorun: "all",
    favFirst: true,
  });

  useEffect(() => {
    load("settings.json")
      .then((store) => store.get<string[]>(STORE_KEY))
      .then((f) => setFavorites(f ?? []))
      .catch(() => {});
    loadLanguagePref().then(setLangPref).catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listServices()
      .then(setServices)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  const showToast = (kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const onLanguageChange = async (pref: LanguagePref) => {
    setLangPref(pref);
    await saveLanguagePref(pref);
  };

  const toggleFav = async (s: ServiceInfo) => {
    const key = `${s.domain}/${s.label}`;
    const next = favorites.includes(key)
      ? favorites.filter((f) => f !== key)
      : [...favorites, key];
    setFavorites(next);
    try {
      const store = await load("settings.json");
      await store.set(STORE_KEY, next);
      await store.save();
    } catch (e) {
      showToast("err", t("toast.favSaveFailed", { message: String(e) }));
    }
  };

  const doAction = async (
    s: ServiceInfo,
    action: "start" | "stop" | "restart"
  ) => {
    const key = `${s.domain}/${s.label}`;
    setBusy(key);
    try {
      if (action === "start") await startService(s.domain, s.label, s.plist_path);
      else if (action === "stop") await stopService(s.domain, s.label);
      else await restartService(s.domain, s.label, s.plist_path);
      showToast("ok", t(ACTION_OK_KEY[action], { label: s.label }));
      refresh();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(refresh, 3000);
    } catch (e) {
      showToast(
        "err",
        t("common.actionFailed", { action: t(`actions.${action}`), message: String(e) })
      );
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (s: ServiceInfo) => {
    const key = `${s.domain}/${s.label}`;
    setConfirmDel(null);
    setBusy(key);
    try {
      await deleteService(s.domain, s.label, s.plist_path!);
      showToast("ok", t("toast.deleteOk", { label: s.label }));
      refresh();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(refresh, 3000);
    } catch (e) {
      showToast("err", t("toast.deleteFailed", { label: s.label, message: String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let list = services.filter((s) => {
      if (q && !s.label.toLowerCase().includes(q)) return false;
      if (filters.source === "system" && !s.is_system) return false;
      if (filters.source === "thirdparty" && s.is_system) return false;
      if (filters.status === "running" && !s.running) return false;
      if (filters.status === "stopped" && s.running) return false;
      const auto = s.run_at_load || s.keep_alive;
      if (filters.autorun === "yes" && !auto) return false;
      if (filters.autorun === "no" && auto) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (filters.favFirst) {
        const fa = favorites.includes(`${a.domain}/${a.label}`) ? 0 : 1;
        const fb = favorites.includes(`${b.domain}/${b.label}`) ? 0 : 1;
        if (fa !== fb) return fa - fb;
      }
      return a.label.localeCompare(b.label);
    });
    return list;
  }, [services, filters, favorites]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t("list.title")}</h1>
        <div className="ops" style={{ marginTop: 0 }}>
          <select
            className="lang-select"
            value={langPref}
            title={t("lang.title")}
            onChange={(e) => onLanguageChange(e.target.value as LanguagePref)}
          >
            <option value="auto">{t("lang.auto")}</option>
            <option value="zh-CN">{t("lang.zh")}</option>
            <option value="en">{t("lang.en")}</option>
          </select>
          <button className="btn" onClick={onOpenBackups}>
            {t("list.backups")}
          </button>
        </div>
      </div>
      <FilterBar filters={filters} onChange={setFilters} onRefresh={refresh} loading={loading} />
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">{t("common.loadFailed", { message: error })}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Label</th>
              <th style={{ width: 120 }}>{t("list.colStatus")}</th>
              <th style={{ width: 70 }}>{t("list.colAutorun")}</th>
              <th style={{ width: 60 }}>{t("list.colDomain")}</th>
              <th style={{ width: 300 }}>{t("list.colOps")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const key = `${s.domain}/${s.label}`;
              const fav = favorites.includes(key);
              const isBusy = busy === key;
              return (
                <tr key={key}>
                  <td>
                    <button className={`star ${fav ? "on" : ""}`} onClick={() => toggleFav(s)} title={t("list.fav")}>
                      {fav ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="label-cell" title={s.plist_path ?? undefined}>{s.label}</td>
                  <td>
                    {s.running ? (
                      <span className="status running">
                        <span className="dot" /> {t("common.running")}
                        {s.pid ? ` (${s.pid})` : ""}
                      </span>
                    ) : (
                      <span className="status stopped">{t("common.stopped")}</span>
                    )}
                  </td>
                  <td>{s.run_at_load || s.keep_alive ? t("common.yes") : t("common.no")}</td>
                  <td>{s.domain}</td>
                  <td>
                    <div className="ops">
                      <button className="btn" disabled={isBusy || s.running} onClick={() => doAction(s, "start")}>
                        {t("actions.start")}
                      </button>
                      <button className="btn" disabled={isBusy || !s.running} onClick={() => doAction(s, "stop")}>
                        {t("actions.stop")}
                      </button>
                      <button className="btn" disabled={isBusy} onClick={() => doAction(s, "restart")}>
                        {t("actions.restart")}
                      </button>
                      <button className="btn" onClick={() => onOpenDetail(s)}>
                        {t("actions.detail")}
                      </button>
                      <button
                        className="btn danger"
                        disabled={isBusy || s.is_system || !s.plist_path}
                        title={
                          s.is_system
                            ? t("list.delSipTitle")
                            : s.plist_path
                              ? t("list.delTitle")
                              : t("list.delNoPlistTitle")
                        }
                        onClick={() => setConfirmDel(s)}
                      >
                        {t("actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  {t("list.noMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="footer">
        {loading ? t("common.loading") : t("list.count", { visible: visible.length, total: services.length })}
      </div>
      {confirmDel && (
        <ConfirmModal
          title={t("confirmDeleteService.title")}
          message={t("confirmDeleteService.message", {
            label: confirmDel.label,
            path: confirmDel.plist_path,
          })}
          confirmText={t("confirmDeleteService.confirm")}
          danger
          onConfirm={() => doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
