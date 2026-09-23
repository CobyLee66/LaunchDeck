import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <div className="filter-bar">
      <input
        className="search"
        placeholder={t("filter.searchPlaceholder")}
        value={filters.search}
        onChange={(e) => set("search", e.target.value)}
      />
      <select value={filters.source} onChange={(e) => set("source", e.target.value as Filters["source"])}>
        <option value="all">{t("filter.sourceAll")}</option>
        <option value="system">{t("filter.sourceSystem")}</option>
        <option value="thirdparty">{t("filter.sourceThirdparty")}</option>
      </select>
      <select value={filters.status} onChange={(e) => set("status", e.target.value as Filters["status"])}>
        <option value="all">{t("filter.statusAll")}</option>
        <option value="running">{t("filter.statusRunning")}</option>
        <option value="stopped">{t("filter.statusStopped")}</option>
      </select>
      <select value={filters.autorun} onChange={(e) => set("autorun", e.target.value as Filters["autorun"])}>
        <option value="all">{t("filter.autorunAll")}</option>
        <option value="yes">{t("filter.autorunYes")}</option>
        <option value="no">{t("filter.autorunNo")}</option>
      </select>
      <label className="chk">
        <input
          type="checkbox"
          checked={filters.favFirst}
          onChange={(e) => set("favFirst", e.target.checked)}
        />
        {t("filter.favFirst")}
      </label>
      <button className="btn" onClick={onRefresh} disabled={loading}>
        {loading ? t("common.refreshing") : t("common.refresh")}
      </button>
    </div>
  );
}
