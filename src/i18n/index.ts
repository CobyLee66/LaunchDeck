import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { load } from "@tauri-apps/plugin-store";
import { getSystemLocale, setLanguage } from "../api";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";

export type Language = "zh-CN" | "en";
export type LanguagePref = Language | "auto";

i18next.use(initReactI18next).init({
  // 资源内联打包，init 同步完成；lng 先按浏览器环境猜一个，initLanguage() 会立刻纠正
  resources: {
    "zh-CN": { translation: zhCN },
    en: { translation: en },
  },
  lng: toLanguage(navigator.language),
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React 自带转义
  react: { useSuspense: false },
});

/// 原始 locale → 支持的语言；仅简体中文识别为中文，其它语言一律英文
export function toLanguage(locale: string | null | undefined): Language {
  if (!locale) return "en";
  const l = locale.toLowerCase().replace(/_/g, "-");
  return l.startsWith("zh-hans") || l.startsWith("zh-cn") || l.startsWith("zh-sg")
    ? "zh-CN"
    : "en";
}

async function detectSystemLanguage(): Promise<Language> {
  try {
    return toLanguage(await getSystemLocale());
  } catch {
    return "en";
  }
}

/// 读取持久化的语言偏好；无记录或非法值按 auto（跟随系统）处理
export async function loadLanguagePref(): Promise<LanguagePref> {
  try {
    const store = await load("settings.json");
    const v = await store.get<string>("language");
    if (v === "zh-CN" || v === "en" || v === "auto") return v;
  } catch {
    // store 不可用（如纯浏览器调试）按 auto 处理
  }
  return "auto";
}

async function persistLanguagePref(pref: LanguagePref): Promise<void> {
  try {
    const store = await load("settings.json");
    await store.set("language", pref);
    await store.save();
  } catch {
    // 持久化失败不阻塞切换
  }
}

/// 应用语言偏好：确定语言、切换 UI、同步 <html lang> 与后端错误文案语言
async function applyLanguagePref(pref: LanguagePref): Promise<Language> {
  const lang = pref === "auto" ? await detectSystemLanguage() : pref;
  await i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    await setLanguage(lang);
  } catch {
    // 后端同步失败不阻塞 UI
  }
  return lang;
}

/// main.tsx 渲染前调用：先定语言再渲染，避免首帧语言与偏好不一致
export async function initLanguage(): Promise<void> {
  await applyLanguagePref(await loadLanguagePref());
}

/// 手动切换语言：持久化偏好并立即生效
export async function saveLanguagePref(pref: LanguagePref): Promise<void> {
  await persistLanguagePref(pref);
  await applyLanguagePref(pref);
}
