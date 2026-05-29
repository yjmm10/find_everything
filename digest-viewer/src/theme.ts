export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "digest-viewer-theme";

export function getStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private mode */
  }
  return "system";
}

export function setStoredTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}

export function applyTheme(pref: ThemePreference): "light" | "dark" {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePref = pref;
  root.style.colorScheme = resolved;
  return resolved;
}

let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

/** 应用主题并监听 system 模式下的系统偏好变化 */
export function initTheme(): ThemePreference {
  const pref = getStoredTheme();
  applyTheme(pref);

  const mq = window.matchMedia("(prefers-color-scheme: light)");
  if (mediaListener) mq.removeEventListener("change", mediaListener);
  mediaListener = () => {
    if (getStoredTheme() === "system") applyTheme("system");
  };
  mq.addEventListener("change", mediaListener);
  return pref;
}

export function setTheme(pref: ThemePreference): "light" | "dark" {
  setStoredTheme(pref);
  return applyTheme(pref);
}

export const THEME_LABEL: Record<ThemePreference, string> = {
  light: "浅色",
  dark: "深色",
  system: "跟随系统",
};
