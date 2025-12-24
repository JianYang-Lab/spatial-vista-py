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
            <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
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

  // Reuse or create the main container inside shadow
  let container = shadow.getElementById(
    "spatialvista-root-container",
  ) as HTMLElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = "spatialvista-root-container";
    container.style.width = "100%";
    container.style.height = "800px";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.position = "relative";
    container.classList.add("light");
    shadow.appendChild(container);
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
        <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
          <Vis />
        </ThemeProvider>
      </WidgetModelContext.Provider>,
    );
  } else {
    // If a root already exists, just re-render into it (keeps a single React root + single WebGL context)
    try {
      (el as any).__spatialvista_root__.render(
        <WidgetModelContext.Provider value={model}>
          <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
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
          <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
            <Vis />
          </ThemeProvider>
        </WidgetModelContext.Provider>,
      );
    }
  }
}
