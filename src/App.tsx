import { useCallback, useState } from "react";
import ServiceList from "./components/ServiceList";
import ServiceDetail from "./components/ServiceDetail";
import BackupManager from "./components/BackupManager";

export type View =
  | { kind: "list" }
  | { kind: "detail"; domain: string; label: string }
  | { kind: "backups" };

export default function App() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  return (
    <div className="app">
      {view.kind === "list" ? (
        <ServiceList
          key={reloadTick}
          onOpenDetail={(s) => setView({ kind: "detail", domain: s.domain, label: s.label })}
          onOpenBackups={() => setView({ kind: "backups" })}
        />
      ) : view.kind === "backups" ? (
        <BackupManager
          onBack={() => {
            reload();
            setView({ kind: "list" });
          }}
        />
      ) : (
        <ServiceDetail
          domain={view.domain}
          label={view.label}
          onBack={() => {
            reload();
            setView({ kind: "list" });
          }}
        />
      )}
    </div>
  );
}
