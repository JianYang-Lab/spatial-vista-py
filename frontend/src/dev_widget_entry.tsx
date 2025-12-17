import "./index.css";
import { mountWidget } from "./widget_mount";

function createDevRoot() {
  // 模拟 Jupyter cell
  const outer = document.createElement("div");
  outer.style.width = "100%";
  outer.style.height = "100vh";
  outer.style.padding = "24px";
  outer.style.background = "#0f0f0f";

  const cell = document.createElement("div");
  cell.style.width = "100%";
  cell.style.height = "800px";
  cell.style.border = "1px solid #333";
  cell.style.borderRadius = "8px";
  // cell.style.overflow = "hidden";

  outer.appendChild(cell);
  document.body.appendChild(outer);

  mountWidget(cell);
}

createDevRoot();
