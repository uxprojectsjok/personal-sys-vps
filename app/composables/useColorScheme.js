import { ref } from "vue";

const STORAGE_KEY = "sys-color-scheme";

const isDark = ref(true);

function applyTheme(dark) {
  isDark.value = dark;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
}

if (typeof window !== "undefined") {
  const stored = localStorage.getItem(STORAGE_KEY);
  applyTheme(stored !== "light");
}

export function useColorScheme() {
  function setDark(dark) {
    applyTheme(dark);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
    }
  }

  function toggle() {
    setDark(!isDark.value);
  }

  return { isDark, setDark, toggle };
}
