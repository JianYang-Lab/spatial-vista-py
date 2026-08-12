import "./index.css";
import { mountWidget } from "./widget_mount";

type Listener = () => void;

class StandaloneModel {
  private values: Record<string, unknown>;
  private listeners = new Map<string, Set<Listener>>();

  constructor(values: Record<string, unknown>) {
    this.values = values;
  }

  get(name: string) {
    return this.values[name];
  }

  set(name: string, value: unknown) {
    this.values[name] = value;
    this.listeners.get(`change:${name}`)?.forEach((listener) => listener());
  }

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
  }

  save_changes() {}
}

const fetchBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

async function start() {
  const manifest = await (await fetch("/api/manifest")).json();
  const annotationEntries = await Promise.all(
    Object.entries(manifest.annotation_urls).map(async ([name, url]) => [name, await fetchBytes(url as string)]),
  );
  const continuousEntries = await Promise.all(
    Object.entries(manifest.continuous_urls).map(async ([name, url]) => [name, await fetchBytes(url as string)]),
  );
  const model = new StandaloneModel({
    global_config: manifest.global_config,
    annotation_config: manifest.annotation_config,
    annotation_bins: Object.fromEntries(annotationEntries),
    continuous_config: manifest.continuous_config,
    continuous_bins: Object.fromEntries(continuousEntries),
    laz_bytes: await fetchBytes(manifest.laz_url),
    selected_cells: {},
  });
  const element = document.getElementById("spatialvista-app");
  if (!element) throw new Error("SpatialVista root element is missing");
  mountWidget(element, model);
}

start().catch((error) => {
  document.body.textContent = `Failed to start SpatialVista: ${error}`;
  console.error(error);
});
