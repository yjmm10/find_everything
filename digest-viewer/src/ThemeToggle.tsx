import { useEffect, useState } from "react";
import {
  type ThemePreference,
  getStoredTheme,
  setTheme,
  THEME_LABEL,
} from "./theme";

const OPTIONS: ThemePreference[] = ["light", "dark", "system"];

const ICON: Record<ThemePreference, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getStoredTheme());

  useEffect(() => {
    setPref(getStoredTheme());
  }, []);

  const cycle = () => {
    const idx = OPTIONS.indexOf(pref);
    const next = OPTIONS[(idx + 1) % OPTIONS.length];
    setTheme(next);
    setPref(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={`主题：${THEME_LABEL[pref]}（点击切换）`}
      aria-label={`当前主题 ${THEME_LABEL[pref]}，点击切换`}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {ICON[pref]}
      </span>
      <span className="theme-toggle__label">{THEME_LABEL[pref]}</span>
    </button>
  );
}
