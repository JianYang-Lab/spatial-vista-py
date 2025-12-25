import React from "react";
import { createRoot } from "react-dom/client";
import Vis from "./pages/Vis";
import { ThemeProvider } from "./components/theme-provider";
import { WidgetModelContext } from "./widget_context";

/**
 * mountWidget - mounts the React widget into the provided host element.
 *
 * Guards are added to:
 *  - avoid double-mounting (which can create multiple WebGL contexts)
 *  - reuse an existing shadow/container/root when re-invoked
 */
export function mountWidget(el: HTMLElement, model: any) {
  // Prevent duplicate mounts on the same host element
  if ((el as any).__spatialvista_mounted__) {
    // If already mounted, attempt to re-render with the new model to update state/context
    try {
      const existingRoot = (el as any).__spatialvista_root__;
      if (existingRoot) {
        existingRoot.render(
          <WidgetModelContext.Provider value={model}>
            <ThemeProvider
              defaultTheme="jupyter"
              storageKey="spatialvista-theme"
            >
              <Vis />
            </ThemeProvider>
          </WidgetModelContext.Provider>,
        );
      }
    } catch (e) {
      // swallow errors but report so developer knows
      // eslint-disable-next-line no-console
      console.warn("mountWidget: re-render failed for existing mount:", e);
    }
    return;
  }
  (el as any).__spatialvista_mounted__ = true;

  el.style.width = "100%";
  el.style.height = "100%";

  // Reuse existing shadowRoot if present, otherwise create one.
  const shadow = (el as any).shadowRoot || el.attachShadow({ mode: "open" });

  // Inject global styles into the shadow only once per shadow root
  if (!(shadow as any).__spatialvista_styles_injected__) {
    document.querySelectorAll("style").forEach((style) => {
      shadow.appendChild(style.cloneNode(true));
    });
    (shadow as any).__spatialvista_styles_injected__ = true;
  }

  // Helper: read global_config from model with fallbacks and extract Height
  const readHeightFromModel = () => {
    // prefer snake_case trait name
    const cfg =
      model.get("global_config") ??
      // fallback if some code uses a top-level trait named "GlobalConfig"
      model.get("GlobalConfig") ??
      null;
    // cfg might be:
    // 1) { GlobalConfig: { Height: 600 } }  <-- what backend sets
    // 2) { Height: 600 }                     <-- possible simpler shape
    const height =
      cfg?.GlobalConfig?.Height ?? cfg?.Height ?? /* default */ 800;
    return Number.isFinite(height) ? `${height}px` : "800px";
  };

  const height_style = readHeightFromModel();

  // Helper: read jupyter theme from body attribute
  const getJupyterTheme = () => {
    try {
      const name = document.body.getAttribute("data-jp-theme-name");
      if (!name) return "light";
      return name.toLowerCase().includes("dark") ? "dark" : "light";
    } catch {
      return "light";
    }
  };

  // Reuse or create the main container inside shadow
  let container = shadow.getElementById(
    "spatialvista-root-container",
  ) as HTMLElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = "spatialvista-root-container";
    container.style.width = "100%";
    container.style.height = height_style;
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.position = "relative";

    // set initial theme class based on Jupyter (fallback to light)
    const initTheme = getJupyterTheme();
    container.classList.add(initTheme);

    shadow.appendChild(container);
  } else {
    // If container already exists, ensure height is up-to-date
    container.style.height = height_style;
    // ensure theme class exists
    const initTheme = getJupyterTheme();
    container.classList.remove("light", "dark");
    container.classList.add(initTheme);
  }

  // Listen for changes to global_config so we can update container height dynamically
  const updateHeightHandler = () => {
    try {
      const hs = readHeightFromModel();
      if (container) container.style.height = hs;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("mountWidget: failed to update height from model:", e);
    }
  };
  // Register listeners for both possible trait names (primary and fallback)
  model.on("change:global_config", updateHeightHandler);
  model.on("change:GlobalConfig", updateHeightHandler);

  // Observe Jupyter theme changes and sync container class (avoid installing multiple observers)
  if (!(shadow as any).__spatialvista_theme_observer_installed__) {
    try {
      const body = document.body;
      const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (
            m.type === "attributes" &&
            m.attributeName === "data-jp-theme-name"
          ) {
            const name = document.body.getAttribute("data-jp-theme-name");
            const theme =
              name && name.toLowerCase().includes("dark") ? "dark" : "light";
            const c = shadow.getElementById("spatialvista-root-container");
            if (c) {
              c.classList.remove("light", "dark");
              c.classList.add(theme);
            }
          }
        }
      });
      mo.observe(body, {
        attributes: true,
        attributeFilter: ["data-jp-theme-name"],
      });
      (shadow as any).__spatialvista_theme_observer_installed__ = true;
    } catch (e) {
      // ignore if MutationObserver unsupported
    }
  }

  // Reuse or create the portal root inside shadow
  let portalRoot = shadow.getElementById(
    "spatialvista-portal-root",
  ) as HTMLElement | null;
  if (!portalRoot) {
    portalRoot = document.createElement("div");
    portalRoot.id = "spatialvista-portal-root";
    portalRoot.style.position = "absolute";
    portalRoot.style.inset = "0";
    portalRoot.style.zIndex = "50";
    portalRoot.style.pointerEvents = "none";
    shadow.appendChild(portalRoot);
  }

  (window as any).__SPATIALVISTA_DIALOG_PORTAL__ = portalRoot;

  // Create or reuse the React root to avoid creating multiple roots / contexts
  if (!(el as any).__spatialvista_root__) {
    const root = createRoot(container);
    (el as any).__spatialvista_root__ = root;
    root.render(
      <WidgetModelContext.Provider value={model}>
        <ThemeProvider defaultTheme="jupyter" storageKey="spatialvista-theme">
          <Vis />
        </ThemeProvider>
      </WidgetModelContext.Provider>,
    );
  } else {
    // If a root already exists, just re-render into it (keeps a single React root + single WebGL context)
    try {
      (el as any).__spatialvista_root__.render(
        <WidgetModelContext.Provider value={model}>
          <ThemeProvider defaultTheme="jupyter" storageKey="spatialvista-theme">
            <Vis />
          </ThemeProvider>
        </WidgetModelContext.Provider>,
      );
    } catch (err) {
      // If re-render fails for some reason, fallback to creating a new root (last resort)
      // eslint-disable-next-line no-console
      console.warn(
        "mountWidget: failed to reuse existing root, recreating it:",
        err,
      );
      const root = createRoot(container);
      (el as any).__spatialvista_root__ = root;
      root.render(
        <WidgetModelContext.Provider value={model}>
          <ThemeProvider defaultTheme="jupyter" storageKey="spatialvista-theme">
            <Vis />
          </ThemeProvider>
        </WidgetModelContext.Provider>,
      );
    }
  }
}
