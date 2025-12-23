import "./index.css";
import { mountWidget } from "./widget_mount";

export default {
  render({ el, model }: any) {
    mountWidget(el, model);
  },
};
