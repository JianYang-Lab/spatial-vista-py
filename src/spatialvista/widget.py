# spatialvista/widget.py
import time
from pathlib import Path

import anywidget
import traitlets
from loguru import logger

# Measure time to load the ESM JS file at import time
_WIDGET_PATH = Path(__file__).parent / "_widget" / "spatialvista_widget.mjs"
_t0 = time.perf_counter()
try:
    _WIDGET_JS = _WIDGET_PATH.read_text(encoding="utf-8")
    _LOAD_DURATION = time.perf_counter() - _t0
    logger.info(
        "Loaded _WIDGET_JS from {} ({} bytes) in {:.6f}s",
        _WIDGET_PATH,
        len(_WIDGET_JS),
        _LOAD_DURATION,
    )
except Exception as exc:
    _LOAD_DURATION = time.perf_counter() - _t0
    _WIDGET_JS = ""
    logger.exception(
        "Failed to load _WIDGET_JS from {} after {:.6f}s: {}",
        _WIDGET_PATH,
        _LOAD_DURATION,
        exc,
    )


class SpatialVistaWidget(anywidget.AnyWidget):
    _esm = _WIDGET_JS

    # ========== Point cloud ==========
    laz_bytes = traitlets.Bytes(help="LAZ point cloud bytes").tag(sync=True)

    # ========== Categorical annotations ==========
    annotation_config = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Any(),
        help="Annotation schema config (JSON-safe)",
    ).tag(sync=True)

    annotation_bins = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Bytes(),
        help="Annotation binary buffers",
    ).tag(sync=True)

    # ========== Continuous traits (NEW) ==========
    continuous_config = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Dict(),
        help="Continuous trait metadata (min/max/source)",
    ).tag(sync=True)

    continuous_bins = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Bytes(),
        help="Continuous trait binary buffers (float32)",
    ).tag(sync=True)

    def __init__(self, *args, **kwargs):
        self._created_at = time.perf_counter()
        super().__init__(*args, **kwargs)
        logger.info("SpatialVistaWidget created at {:.6f}", self._created_at)

    # Generic observer for several traits
    @traitlets.observe(
        "laz_bytes",
        "annotation_bins",
        "annotation_config",
        "continuous_bins",
        "continuous_config",
    )
    def _on_trait_change(self, change):
        """
        change is a dict with keys: name, old, new, owner, type
        Log the time taken to compute simple size/count metrics for the new value.
        """
        t0 = time.perf_counter()
        name = change.get("name")
        new = change.get("new")

        try:
            if name == "laz_bytes":
                size = len(new) if new is not None else 0
                info = {"bytes": size}
            elif name in ("annotation_bins", "continuous_bins"):
                if new is None:
                    count = 0
                    total_bytes = 0
                else:
                    count = len(new)
                    # values are bytes
                    total_bytes = sum(len(v) for v in new.values())
                info = {"bins": count, "bytes": total_bytes}
            elif name in ("annotation_config", "continuous_config"):
                if new is None:
                    count = 0
                else:
                    count = len(new)
                info = {"items": count}
            else:
                info = {}
        except Exception as e:
            # ensure observer never raises
            t_err = time.perf_counter() - t0
            logger.exception(
                "Error while computing metrics for trait {} (took {:.6f}s): {}",
                name,
                t_err,
                e,
            )
            return

        duration = time.perf_counter() - t0
        logger.info(
            "SpatialVistaWidget trait '{}' updated: {} took {:.6f}s",
            name,
            info,
            duration,
        )
