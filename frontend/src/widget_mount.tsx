// import React from "react";
// import { createRoot } from "react-dom/client";
// import Vis from "./pages/Vis";
// import { ThemeProvider } from "./components/theme-provider";

// export function mountWidget(el: HTMLElement) {
//   el.style.width = "100%";
//   el.style.height = "800px";
//   el.style.display = "flex";

//   const container = document.createElement("div");
//   container.style.width = "100%";
//   container.style.height = "100%";
//   container.style.display = "flex";
//   container.style.flexDirection = "column";
//   container.classList.add("light");

//   el.appendChild(container);

//   const root = createRoot(container);
//   root.render(
//     <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
//       <Vis />
//     </ThemeProvider>,
//   );
// }
//
import React from "react";
import { createRoot } from "react-dom/client";
import Vis from "./pages/Vis";
import { ThemeProvider } from "./components/theme-provider";

export function mountWidget(el: HTMLElement) {
  el.style.width = "100%";
  el.style.height = "800px";

  //  Shadow DOM
  const shadow = el.attachShadow({ mode: "open" });

  document.querySelectorAll("style").forEach((style) => {
    shadow.appendChild(style.cloneNode(true));
  });

  const container = document.createElement("div");
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.position = "relative";
  container.classList.add("light");

  shadow.appendChild(container);

  const portalRoot = document.createElement("div");
  portalRoot.id = "spatialvista-portal-root";

  /* ⭐ 关键样式 */
  portalRoot.style.pointerEvents = "none";
  portalRoot.style.position = "absolute";
  portalRoot.style.inset = "0";
  portalRoot.style.zIndex = "50";

  /* 保证不影响布局 */
  portalRoot.style.width = "100%";
  portalRoot.style.height = "100%";

  shadow.appendChild(portalRoot);

  (window as any).__SPATIALVISTA_DIALOG_PORTAL__ = portalRoot;

  const root = createRoot(container);
  root.render(
    <ThemeProvider defaultTheme="light" storageKey="spatialvista-theme">
      <Vis />
    </ThemeProvider>,
  );
}
