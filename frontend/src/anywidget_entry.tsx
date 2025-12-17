import "./index.css";
import { mountWidget } from "./widget_mount";

export default {
  render({ el, model }: any) {
    // ⭐ 仅用于调试
    (window as any).__SPATIALVISTA_MODEL__ = model;
    mountWidget(el, model);
  },
};
