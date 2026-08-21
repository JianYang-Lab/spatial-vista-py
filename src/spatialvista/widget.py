# spatialvista/widget.py
import time
from pathlib import Path

import anywidget
import numpy as np
import traitlets

from ._logger import logger

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

    # ========== Frontend selection result ==========
    selected_cells = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Any(),
        default_value={},
        help=(
            "Cells selected in the frontend. Contains selected point order "
            "under 'indices'/'orders' and, when available, obs ids under 'ids'."
        ),
    ).tag(sync=True)

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

    # ========== Global config (frontend settings) ==========
    global_config = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Any(),
        help="Global configuration passed to frontend (e.g. {'GlobalConfig': {'Height': 600}})",
    ).tag(sync=True)

    alignment_transforms = traitlets.Dict(
        key_trait=traitlets.Unicode(),
        value_trait=traitlets.Any(),
        default_value={},
        help="Section alignment parameters produced by the frontend",
    ).tag(sync=True)

    def __init__(self, *args, **kwargs):
        self._created_at = time.perf_counter()
        self._cell_ids: list[str] = []
        self._enriching_selected_cells = False
        self._alignment_adata = None
        self._alignment_position_key: str | None = None
        self._alignment_section_key: str | None = None
        super().__init__(*args, **kwargs)
        logger.info("SpatialVistaWidget created at {:.6f}", self._created_at)

    def set_cell_ids(self, cell_ids) -> None:
        """Store cell ids so frontend point order can be mapped back to obs names."""
        self._cell_ids = [str(cell_id) for cell_id in cell_ids]
        logger.info("SpatialVistaWidget stored {} cell ids", len(self._cell_ids))

    def set_alignment_source(
        self, adata, position_key: str, section_key: str | None
    ) -> None:
        """Keep the AnnData source needed to materialize aligned coordinates."""
        self._alignment_adata = adata
        self._alignment_position_key = position_key
        self._alignment_section_key = section_key

    @property
    def alignment_parameters(self) -> dict:
        """Return the latest JSON-compatible section alignment parameters."""
        return dict(self.alignment_transforms or {})

    def apply_alignment(self, output_key: str = "spatial_aligned") -> np.ndarray:
        """Apply frontend alignment and write 3D coordinates to ``adata.obsm``.

        Parameters
        ----------
        output_key : str, default "spatial_aligned"
            Destination key in ``adata.obsm``.

        Returns
        -------
        numpy.ndarray
            The aligned ``(n_obs, 3)`` coordinates.
        """
        if self._alignment_adata is None or self._alignment_position_key is None:
            raise RuntimeError(
                "This widget is not attached to an AnnData alignment source."
            )
        if self._alignment_section_key is None:
            raise RuntimeError("Alignment requires vis(..., section=...).")
        params = self.alignment_parameters
        if not params:
            raise RuntimeError(
                "No alignment parameters have been received from the frontend."
            )

        adata = self._alignment_adata
        source = np.asarray(adata.obsm[self._alignment_position_key], dtype=float)
        if source.ndim != 2 or source.shape[1] not in (2, 3):
            raise ValueError(
                "Alignment source coordinates must have shape (n_obs, 2 or 3)."
            )
        coords = np.zeros((source.shape[0], 3), dtype=float)
        coords[:, : source.shape[1]] = source
        labels = np.asarray(adata.obs[self._alignment_section_key].astype(str))
        transforms = params.get("transforms", {})

        for label in np.unique(labels):
            mask = labels == label
            transform = transforms.get(str(label), {})
            center = coords[mask, :2].mean(axis=0)
            angle = np.deg2rad(float(transform.get("rotation", 0.0)))
            scale = float(transform.get("scale", 1.0))
            flip = np.array(
                [
                    -1.0 if transform.get("flip_x", False) else 1.0,
                    -1.0 if transform.get("flip_y", False) else 1.0,
                ]
            )
            rotation = np.array(
                [[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]
            )
            centered = (coords[mask, :2] - center) * flip
            coords[mask, :2] = (
                centered @ rotation.T * scale
                + center
                + np.array(
                    [
                        float(transform.get("translate_x", 0.0)),
                        float(transform.get("translate_y", 0.0)),
                    ]
                )
            )

        spacing = params.get("z_spacing", {})
        spacing_mode = spacing.get("mode", "multiplier")
        spacing_value = float(spacing.get("value", 1.0))
        section_centers = {
            str(label): float(coords[labels == label, 2].mean())
            for label in np.unique(labels)
        }
        global_center = float(coords[:, 2].mean())
        fixed_centers = {}
        if spacing_mode == "fixed":
            ordered = sorted(
                section_centers, key=lambda key: (section_centers[key], key)
            )
            middle = (len(ordered) - 1) / 2
            fixed_centers = {
                label: global_center + (index - middle) * spacing_value
                for index, label in enumerate(ordered)
            }
        for label, section_center in section_centers.items():
            mask = labels == label
            target = (
                fixed_centers[label]
                if spacing_mode == "fixed"
                else global_center + (section_center - global_center) * spacing_value
            )
            coords[mask, 2] += target - section_center

        adata.obsm[output_key] = coords
        return coords

    @property
    def selected_indices(self) -> list[int]:
        """Selected zero-based point orders from the latest frontend selection."""
        raw = self.selected_cells or {}
        values = raw.get("indices", raw.get("orders", []))
        return [int(v) for v in values]

    @property
    def selected_orders(self) -> list[int]:
        """Alias for selected_indices, matching cell order terminology."""
        return self.selected_indices

    @property
    def selected_ids(self) -> list[str]:
        """Selected obs ids, mapped from selected_indices when possible."""
        raw = self.selected_cells or {}
        ids = raw.get("ids")
        if ids is not None:
            return [str(v) for v in ids]
        if not self._cell_ids:
            return [str(i) for i in self.selected_indices]
        return [
            self._cell_ids[i]
            for i in self.selected_indices
            if 0 <= i < len(self._cell_ids)
        ]

    @traitlets.observe("selected_cells")
    def _on_selected_cells_change(self, change):
        if self._enriching_selected_cells:
            return

        new = change.get("new") or {}
        if not isinstance(new, dict):
            return

        indices = new.get("indices", new.get("orders", []))
        if not isinstance(indices, (list, tuple)):
            return

        enriched = dict(new)
        enriched["indices"] = [int(i) for i in indices]
        enriched["orders"] = enriched["indices"]

        if self._cell_ids:
            enriched["ids"] = [
                self._cell_ids[i]
                for i in enriched["indices"]
                if 0 <= i < len(self._cell_ids)
            ]

        if enriched == new:
            return

        self._enriching_selected_cells = True
        try:
            self.selected_cells = enriched
        finally:
            self._enriching_selected_cells = False

    # Generic observer for several traits
    @traitlets.observe(
        "laz_bytes",
        "selected_cells",
        "annotation_bins",
        "annotation_config",
        "continuous_bins",
        "continuous_config",
        "global_config",
        "alignment_transforms",
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
            elif name == "selected_cells":
                if not new:
                    info = {"count": 0}
                else:
                    indices = new.get("indices", new.get("orders", []))
                    info = {"count": len(indices)}
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
            elif name in ("global_config", "alignment_transforms"):
                if new is None:
                    info = {}
                else:
                    # count top-level keys and include JSON size approximation
                    try:
                        # best-effort length for a small config dict
                        info = {"items": len(new), "repr_len": len(str(new))}
                    except Exception:
                        info = {"items": len(new)}
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
