import { createContext, useContext, useEffect, useState, useRef } from "react";

type Theme = "dark" | "light" | "system" | "jupyter";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Helper to read JupyterLab theme name from body attribute and map to 'dark'|'light'
 */
function getJupyterTheme(): "dark" | "light" | null {
  try {
    const name =
      typeof document !== "undefined"
        ? document.body.getAttribute("data-jp-theme-name")
        : null;
    if (!name) return null;
    // map typical names containing 'dark' or 'Dark' to dark
    if (name.toLowerCase().includes("dark")) return "dark";
    return "light";
  } catch {
    return null;
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  // If user has previously selected theme, prefer that (localStorage)
  const stored =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(storageKey)
      : null;

  const initial = (() => {
    if (stored) return stored as Theme;
    if (defaultTheme === "jupyter") {
      const jt = getJupyterTheme();
      return (jt ?? "light") as Theme;
    }
    return defaultTheme;
  })();

  const [theme, setThemeState] = useState<Theme>(initial);

  // track whether we should follow JupyterLab theme changes:
  // follow only when defaultTheme === 'jupyter' AND user hasn't stored a preference
  const followJupyterRef = useRef<boolean>(
    defaultTheme === "jupyter" && !stored,
  );

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (t: Theme) => {
      root.classList.remove("light", "dark");
      if (t === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light";
        root.classList.add(systemTheme);
      } else if (t === "jupyter") {
        // this branch shouldn't normally be used after normalization; keep for safety
        const jt = getJupyterTheme() ?? "light";
        root.classList.add(jt);
      } else {
        root.classList.add(t);
      }
    };

    applyTheme(theme);

    // If theme is 'system', we should listen for prefers-color-scheme changes
    let mql: MediaQueryList | null = null;
    const onPrefChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    if (window.matchMedia) {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener?.("change", onPrefChange);
      mql.addListener?.(onPrefChange); // fallback
    }

    return () => {
      if (mql) {
        mql.removeEventListener?.("change", onPrefChange);
        mql.removeListener?.(onPrefChange);
      }
    };
  }, [theme]);

  // If we're following Jupyter (no stored override), observe body attribute changes
  useEffect(() => {
    if (!followJupyterRef.current) return undefined;

    const body = document.body;
    if (!body || typeof MutationObserver === "undefined") return undefined;

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (
          m.type === "attributes" &&
          m.attributeName === "data-jp-theme-name"
        ) {
          const jt = getJupyterTheme();
          if (jt) {
            // update theme to match Jupyter
            setThemeState(jt as Theme);
          }
        }
      }
    });

    obs.observe(body, {
      attributes: true,
      attributeFilter: ["data-jp-theme-name"],
    });

    // also set initial value from jupyter in case it changed since mount
    const jtInit = getJupyterTheme();
    if (jtInit) setThemeState(jtInit as Theme);

    return () => obs.disconnect();
  }, []);

  const setTheme = (t: Theme) => {
    // if user explicitly sets theme, persist it and stop following Jupyter automatically
    try {
      localStorage.setItem(storageKey, t);
      followJupyterRef.current = false;
    } catch {
      // ignore localStorage errors
    }
    setThemeState(t);
  };

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
