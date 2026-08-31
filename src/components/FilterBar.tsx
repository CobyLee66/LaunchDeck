export interface Filters {
  search: string;
  source: "all" | "system" | "thirdparty";
  status: "all" | "running" | "stopped";
  autorun: "all" | "yes" | "no";
  favFirst: boolean;
}

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  onRefresh: () => void;
  loading: boolean;
}

export default function FilterBar({ filters, onChange, onRefresh, loading }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <div className="filter-bar">
      <input
        className="search"
        placeholder="搜索 label…"
        value={filters.search}
        onChange={(e) => set("search", e.target.value)}
      />
      <select value={filters.source} onChange={(e) => set("source", e.target.value as Filters["source"])}>
        <option value="all">来源: 全部</option>
        <option value="system">Apple 系统</option>
        <option value="thirdparty">第三方</option>
      </select>
      <select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])}>
        <option value="all">状态: 全部</option>
        <option value="running">运行中</option>
        <option value="stopped">已停止</option>
      </select>
      <select value={filters.autorun} onChange={(e) => set("autorun", e.target.value as Filters["autorun"])}>
        <option value="all">自动运行: 全部</option>
        <option value="yes">是</option>
        <option value="no">否</option>
      </select>
      <label className="chk">
        <input
          type="checkbox"
          checked={filters.favFirst}
          onChange={(e) => set("favFirst", e.target.checked)}
        />
        收藏优先
      </label>
      <button className="btn" onClick={onRefresh} disabled={loading}>
        {loading ? "刷新中…" : "刷新"}
      </button>
    </div>
  );
}
