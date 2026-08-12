"""Command-line entry point for serving SpatialVista in a web browser."""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from . import __version__
from .visualize import vis

_ASSET_PATH = Path(__file__).parent / "_widget" / "spatialvista_standalone.mjs"
_INDEX_HTML = """<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SpatialVista</title></head>
<body style="margin:0"><div id="spatialvista-app"></div>
<script type="module" src="/assets/spatialvista_standalone.mjs"></script></body></html>"""


def _split_values(values: list[str] | None) -> list[str] | None:
    if not values:
        return None
    result = [item.strip() for value in values for item in value.split(",")]
    return [item for item in result if item]


def _infer_position(adata: Any) -> str:
    preferred = ("spatial", "X_spatial", "position", "coordinates")
    for key in preferred:
        if key in adata.obsm and getattr(adata.obsm[key], "ndim", 0) == 2:
            if adata.obsm[key].shape[1] in (2, 3):
                return key
    for key, value in adata.obsm.items():
        if getattr(value, "ndim", 0) == 2 and value.shape[1] in (2, 3):
            return str(key)
    raise ValueError(
        "Could not infer spatial coordinates. Pass --position with a 2D/3D adata.obsm key."
    )


def _infer_color(adata: Any) -> str:
    preferred = ("celltype", "cell_type", "annotation", "leiden", "cluster")
    for key in preferred:
        if key in adata.obs:
            return key
    for key in adata.obs.columns:
        column = adata.obs[key]
        if str(column.dtype) in ("category", "object", "string"):
            return str(key)
        try:
            if 1 < int(column.nunique(dropna=True)) <= 100:
                return str(key)
        except Exception:
            continue
    raise ValueError(
        "Could not infer a categorical annotation. Pass --color with an adata.obs key."
    )


def _widget_payload(widget: Any) -> tuple[dict[str, Any], dict[str, bytes]]:
    binaries: dict[str, bytes] = {"laz": bytes(widget.laz_bytes)}
    annotation_urls: dict[str, str] = {}
    continuous_urls: dict[str, str] = {}

    for index, (name, value) in enumerate(widget.annotation_bins.items()):
        token = f"annotation/{index}"
        binaries[token] = bytes(value)
        annotation_urls[name] = f"/api/binary/{token}"
    for index, (name, value) in enumerate(widget.continuous_bins.items()):
        token = f"continuous/{index}"
        binaries[token] = bytes(value)
        continuous_urls[name] = f"/api/binary/{token}"

    manifest = {
        "global_config": widget.global_config,
        "annotation_config": widget.annotation_config,
        "continuous_config": widget.continuous_config,
        "laz_url": "/api/binary/laz",
        "annotation_urls": annotation_urls,
        "continuous_urls": continuous_urls,
    }
    return manifest, binaries


def _make_handler(manifest: dict[str, Any], binaries: dict[str, bytes]):
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()
    asset_bytes = _ASSET_PATH.read_bytes() if _ASSET_PATH.is_file() else None

    class SpatialVistaHandler(BaseHTTPRequestHandler):
        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            path = unquote(urlparse(self.path).path)
            if path in ("/", "/index.html"):
                self._send(200, _INDEX_HTML.encode(), "text/html; charset=utf-8")
            elif path == "/api/manifest":
                self._send(200, manifest_bytes, "application/json")
            elif path.startswith("/api/binary/"):
                key = path.removeprefix("/api/binary/")
                body = binaries.get(key)
                if body is None:
                    self._send(404, b"Not found", "text/plain")
                else:
                    self._send(200, body, "application/octet-stream")
            elif path == "/assets/spatialvista_standalone.mjs" and asset_bytes is not None:
                self._send(200, asset_bytes, "text/javascript; charset=utf-8")
            else:
                content_type = mimetypes.guess_type(path)[0] or "text/plain"
                self._send(404, b"Not found", content_type)

        def log_message(self, format: str, *args: Any) -> None:
            return

    return SpatialVistaHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="spatialvista",
        description="Explore an .h5ad file with SpatialVista in a local browser.",
    )
    parser.add_argument("--input", "-i", type=Path, help="Input .h5ad file")
    parser.add_argument("--position", help="Spatial coordinate key in adata.obsm")
    parser.add_argument("--color", help="Default categorical key in adata.obs")
    parser.add_argument("--section", help="Section/slice key in adata.obs")
    parser.add_argument("--annotations", action="append", help="Extra obs keys (comma-separated)")
    parser.add_argument("--continuous", action="append", help="Continuous obs keys (comma-separated)")
    parser.add_argument("--genes", action="append", help="Genes to include (comma-separated)")
    parser.add_argument("--layer", help="Expression layer used with --genes")
    parser.add_argument("--mode", choices=("2D", "3D"), default="3D")
    parser.add_argument("--height", type=int, default=800)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser automatically")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.input is None:
        parser.error("the following arguments are required: --input")
    input_path = args.input.expanduser().resolve()
    if not input_path.is_file():
        parser.error(f"input file does not exist: {input_path}")
    if input_path.suffix.lower() != ".h5ad":
        parser.error("--input must be an .h5ad file")

    import anndata as ad

    print(f"Loading {input_path} ...", flush=True)
    adata = ad.read_h5ad(input_path)
    position = args.position or _infer_position(adata)
    color = args.color or _infer_color(adata)
    widget = vis(
        adata,
        position=position,
        color=color,
        section=args.section,
        annotations=_split_values(args.annotations),
        continuous=_split_values(args.continuous),
        genes=_split_values(args.genes),
        layer=args.layer,
        height=args.height,
        mode=args.mode,
        _wait_for_all_sends=True,
    )
    manifest, binaries = _widget_payload(widget)
    server = ThreadingHTTPServer((args.host, args.port), _make_handler(manifest, binaries))
    url = f"http://{args.host}:{server.server_port}"
    print(f"SpatialVista is running at {url}")
    print(f"Using position={position!r}, color={color!r}. Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.25, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping SpatialVista.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
