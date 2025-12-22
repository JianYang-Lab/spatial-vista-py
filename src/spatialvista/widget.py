# spatialvista/widget.py
from pathlib import Path

import anywidget
import traitlets

_WIDGET_JS = (
    Path(__file__).parent / "_widget" / "spatialvista_widget.mjs"
).read_text(encoding="utf-8")


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
