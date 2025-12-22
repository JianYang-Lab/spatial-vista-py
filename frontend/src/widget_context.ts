import * as React from "react";

// anywidget 的 model 类型你也可以写成 any，先跑通再说
export const WidgetModelContext = React.createContext<any | null>(null);

export function useWidgetModel() {
  const m = React.useContext(WidgetModelContext);
  if (!m)
    throw new Error(
      "Widget model is not available. Are you running inside anywidget?",
    );
  return m;
}
