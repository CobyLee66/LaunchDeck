import { invoke } from "@tauri-apps/api/core";

export interface ServiceInfo {
  label: string;
  domain: string; // "system" | "gui" | "user"
  plist_path: string | null;
  running: boolean;
  pid: number | null;
  last_exit_code: number | null;
  run_at_load: boolean;
  keep_alive: boolean;
  is_system: boolean;
  program: string | null;
}

export interface ServiceDetail {
  info: ServiceInfo;
  plist_keys: [string, string][];
  raw_print: string;
}

export function listServices(): Promise<ServiceInfo[]> {
  return invoke<ServiceInfo[]>("list_services");
}

export function serviceDetail(domain: string, label: string): Promise<ServiceDetail> {
  return invoke<ServiceDetail>("service_detail", { domain, label });
}

export function startService(domain: string, label: string, plistPath: string | null): Promise<void> {
  return invoke("start_service", { domain, label, plistPath });
}

export function stopService(domain: string, label: string): Promise<void> {
  return invoke("stop_service", { domain, label });
}

export function restartService(domain: string, label: string, plistPath: string | null): Promise<void> {
  return invoke("restart_service", { domain, label, plistPath });
}
