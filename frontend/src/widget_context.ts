import * as React from "react";

export const WidgetModelContext = React.createContext<any | null>(null);

export function useWidgetModel() {
  const m = React.useContext(WidgetModelContext);
  if (!m)
    throw new Error(
      "Widget model is not available. Are you running inside anywidget?",
    );
  return m;
}
