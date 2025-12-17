import "./index.css";
import { mountWidget } from "./widget_mount";

export default {
  render({ el }: any) {
    mountWidget(el);
  },
};
