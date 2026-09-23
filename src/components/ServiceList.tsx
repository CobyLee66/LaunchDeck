import { useCallback, useEffect, useMemo, useState } from "react";
import { load } from "@tauri-apps/plugin-store";
import {
  ServiceInfo,
  listServices,
  startService,
  stopService,
  restartService,
  deleteService,
} from "../api";
import FilterBar, { Filters } from "./FilterBar";
import ConfirmModal from "./ConfirmModal";

const STORE_KEY = "favorites";

interface Props {
  onOpenDetail: (s: ServiceInfo) => void;
  onOpenBackups: () => void;
}

export default function ServiceList({ onOpenDetail, onOpenBackups }: Props) {
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // `${domain}/${label}`
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<ServiceInfo | null>(null);
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
      showToast("err", `保存收藏失败: ${e}`);
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
      showToast("ok", `${action} ${s.label} 成功`);
      refresh();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(refresh, 3000);
    } catch (e) {
      showToast("err", `${action} ${s.label} 失败: ${e}`);
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
      showToast("ok", `已删除 ${s.label}（已备份，可在「备份管理」中恢复）`);
      refresh();
      // 兜底：极端情况下 launchd 状态收敛可能超过后端等待上限，延迟再补偿刷新一次
      window.setTimeout(refresh, 3000);
    } catch (e) {
      showToast("err", `删除 ${s.label} 失败: ${e}`);
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
        <h1>Launchd 服务管理</h1>
        <button className="btn" onClick={onOpenBackups}>
          备份管理
        </button>
      </div>
      <FilterBar filters={filters} onChange={setFilters} onRefresh={refresh} loading={loading} />
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
      {error && <div className="toast err">加载失败: {error}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Label</th>
              <th style={{ width: 120 }}>状态</th>
              <th style={{ width: 70 }}>自动运行</th>
              <th style={{ width: 60 }}>域</th>
              <th style={{ width: 300 }}>操作</th>
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
                    <button className={`star ${fav ? "on" : ""}`} onClick={() => toggleFav(s)} title="收藏">
                      {fav ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="label-cell" title={s.plist_path ?? undefined}>{s.label}</td>
                  <td>
                    {s.running ? (
                      <span className="status running">
                        <span className="dot" /> 运行中{s.pid ? ` (${s.pid})` : ""}
                      </span>
                    ) : (
                      <span className="status stopped">已停止</span>
                    )}
                  </td>
                  <td>{s.run_at_load || s.keep_alive ? "是" : "否"}</td>
                  <td>{s.domain}</td>
                  <td>
                    <div className="ops">
                      <button className="btn" disabled={isBusy || s.running} onClick={() => doAction(s, "start")}>
                        启动
                      </button>
                      <button className="btn" disabled={isBusy || !s.running} onClick={() => doAction(s, "stop")}>
                        停止
                      </button>
                      <button className="btn" disabled={isBusy} onClick={() => doAction(s, "restart")}>
                        重启
                      </button>
                      <button className="btn" onClick={() => onOpenDetail(s)}>
                        详情
                      </button>
                      <button
                        className="btn danger"
                        disabled={isBusy || s.is_system || !s.plist_path}
                        title={
                          s.is_system
                            ? "系统自带服务受 SIP 保护，不可删除"
                            : s.plist_path
                              ? "删除并备份此服务"
                              : "未找到 plist 文件，无法删除"
                        }
                        onClick={() => setConfirmDel(s)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  无匹配服务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="footer">
        {loading ? "加载中…" : `共 ${visible.length} / ${services.length} 个服务`}
      </div>
      {confirmDel && (
        <ConfirmModal
          title="删除服务"
          message={`确定删除服务 ${confirmDel.label} 吗？\n将停止服务并把 ${confirmDel.plist_path} 备份到本机，之后可在「备份管理」中恢复。`}
          confirmText="删除"
          danger
          onConfirm={() => doDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  );
}
