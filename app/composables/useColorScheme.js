import { ref } from "vue";

const isDark = ref(true);

if (typeof window !== "undefined") {
  document.documentElement.setAttribute("data-theme", "dark");
  localStorage.removeItem("sys-color-scheme");
}

export function useColorScheme() {
  return { isDark };
}
