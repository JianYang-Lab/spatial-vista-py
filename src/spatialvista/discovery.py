"""Shared CLI/notebook field discovery and versioned gsMap export validation."""

from collections.abc import Mapping
from dataclasses import dataclass
from numbers import Integral

import numpy as np
import pandas as pd
from pandas.api.types import is_bool_dtype, is_complex_dtype, is_numeric_dtype

from ._logger import logger


def _names(value, label):
    if isinstance(value, str) or not isinstance(value, (list, tuple, np.ndarray)):
        raise ValueError(f"{label} must be a list of column names")
    if isinstance(value, np.ndarray) and value.ndim != 1:
        raise ValueError(f"{label} must be a one-dimensional list")
    result = list(value)
    if any(not isinstance(key, str) or not key for key in result):
        raise ValueError(f"{label} must contain nonempty strings")
    if len(set(result)) != len(result):
        raise ValueError(f"{label} contains duplicate names")
    return result


def _obs_key(adata, key, label):
    if not isinstance(key, str) or not key or key not in adata.obs:
        raise ValueError(f"{label}: obs column {key!r} does not exist")
    return key


def numeric_values(series, label):
    """Preserve missing values, but never reinterpret strings/bools as scores."""
    if (
        not is_numeric_dtype(series.dtype)
        or is_bool_dtype(series.dtype)
        or is_complex_dtype(series.dtype)
    ):
        raise ValueError(f"{label} must be a real numeric column")
    return series.to_numpy(dtype=np.float64, na_value=np.nan)


def validate_gsmap(adata):
    """Validate uns['gsmap'] v1; a column prefix alone never enables trait mode."""
    meta = getattr(adata, "uns", {}).get("gsmap")
    if meta is None:
        return None
    if not isinstance(meta, Mapping):
        raise ValueError("uns['gsmap'] must be a mapping")
    version = meta.get("schema_version")
    if (
        isinstance(version, (bool, np.bool_))
        or not isinstance(version, Integral)
        or version != 1
    ):
        raise ValueError("uns['gsmap']['schema_version'] must be 1")
    if meta.get("value_scale") != "neg_log10_p":
        raise ValueError(
            "gsMap value_scale must be 'neg_log10_p'; raw P values are not accepted"
        )
    position = meta.get("spatial_key")
    if not isinstance(position, str) or position not in adata.obsm:
        raise ValueError(f"gsMap spatial_key {position!r} does not exist in obsm")
    coords = np.asarray(adata.obsm[position])
    if coords.shape != (len(adata.obs), 3):
        raise ValueError("gsMap spatial coordinates must have shape (n_obs, 3)")
    if (
        not np.issubdtype(coords.dtype, np.number)
        or np.iscomplexobj(coords)
        or not np.isfinite(coords).all()
    ):
        raise ValueError("gsMap spatial coordinates must be finite real numbers")
    if (
        not adata.obs.index.is_unique
        or adata.obs.index.hasnans
        or "" in adata.obs.index
    ):
        raise ValueError("gsMap spot IDs must be unique, nonempty and non-missing")
    annotations = _names(meta.get("annotation_keys"), "gsMap annotation_keys")
    for key in annotations:
        _obs_key(adata, key, "gsMap annotation_keys")
    color = _obs_key(adata, meta.get("default_annotation"), "gsMap default_annotation")
    if color not in annotations:
        raise ValueError("gsMap default_annotation must be in annotation_keys")
    section = meta.get("section_key")
    if section is not None:
        _obs_key(adata, section, "gsMap section_key")
        if adata.obs[section].isna().any():
            raise ValueError("gsMap section identifiers must not be missing")
    traits = meta.get("traits")
    if not isinstance(traits, Mapping) or not traits:
        raise ValueError(
            "gsMap traits must be a nonempty mapping of obs keys to labels"
        )
    labels = set()
    for key, label in traits.items():
        _obs_key(adata, key, "gsMap traits")
        if key in annotations or key == section:
            raise ValueError(
                f"gsMap trait {key!r} cannot also be an annotation or section"
            )
        if not isinstance(label, str) or not label.strip() or label in labels:
            raise ValueError("gsMap trait labels must be nonempty and unique")
        labels.add(label)
        values = numeric_values(adata.obs[key], f"gsMap trait {key!r}")
        if np.isinf(values).any() or (values < 0).any():
            raise ValueError(
                f"gsMap trait {key!r} must contain nonnegative -log10(P) values or NaN"
            )
        if not np.isfinite(values).any():
            raise ValueError(f"gsMap trait {key!r} has no finite values")
    return dict(meta, annotation_keys=annotations, traits=dict(traits))


def infer_position(adata):
    for key in (
        "spatial",
        "spatial_3d",
        "spatial_aligned",
        "spatial_algined",
        "X_spatial",
        "position",
        "coordinates",
    ):
        if key in adata.obsm:
            value = adata.obsm[key]
            if getattr(value, "ndim", 0) == 2 and value.shape[1] in (2, 3):
                return key
    raise ValueError(
        "Could not infer spatial coordinates; specify position / --position explicitly"
    )


def infer_annotations(adata):
    keys = []
    for key, column in adata.obs.items():
        if isinstance(column.dtype, pd.CategoricalDtype) or is_bool_dtype(column.dtype):
            keys.append(key)
        elif str(column.dtype) in ("object", "string", "str"):
            # Do not turn spot IDs or free text into enormous category menus.
            if column.nunique(dropna=True) <= min(1000, max(20, len(column) // 5)):
                keys.append(key)
    return keys


def infer_color(adata):
    for key in (
        "celltype",
        "cell_type",
        "annotation",
        "leiden",
        "cluster",
        "clusters",
        "region",
    ):
        if key in adata.obs:
            return key
    return next(iter(infer_annotations(adata)), None)


@dataclass
class ResolvedFields:
    position: str
    color: str | None
    section: str | None
    annotations: list[str]
    continuous: list[str]
    gsmap: dict | None


def resolve_fields(
    adata,
    *,
    position=None,
    color=None,
    section=None,
    annotations=None,
    continuous=None,
    ignore_gsmap=False,
):
    """Explicit options > validated gsMap metadata > general inference.

    None means automatic. Empty lists disable annotation/continuous discovery;
    section="" disables section discovery. Never mutate the input AnnData.
    """
    if not adata.obs.columns.is_unique:
        raise ValueError("Observation column names must be unique")
    meta = None if ignore_gsmap else validate_gsmap(adata)
    defaults = meta or {}
    position = (
        position
        if position is not None
        else defaults.get("spatial_key") or infer_position(adata)
    )
    color = (
        color
        if color is not None
        else defaults.get("default_annotation") or infer_color(adata)
    )
    if section is None:
        section = defaults.get("section_key")
        if section is None:
            section = next(
                (
                    key
                    for key in (
                        "section",
                        "section_id",
                        "slice_id",
                        "slice",
                        "sample_name",
                        "sample",
                        "sample_id",
                    )
                    if key in adata.obs
                ),
                None,
            )
    section = section or None
    annotations = (
        _names(annotations, "annotations")
        if annotations is not None
        else list(defaults["annotation_keys"])
        if meta
        else infer_annotations(adata)
    )
    if continuous is None:
        continuous = list(defaults.get("traits", {}))
        excluded = set(annotations) | {color, section}
        for key, column in adata.obs.items():
            if (
                key not in excluded
                and key not in continuous
                and is_numeric_dtype(column.dtype)
                and not is_bool_dtype(column.dtype)
                and not is_complex_dtype(column.dtype)
            ):
                if np.isfinite(numeric_values(column, key)).any():
                    continuous.append(key)
    else:
        continuous = _names(continuous, "continuous")
    if position not in adata.obsm:
        raise ValueError(f"Position key {position!r} does not exist in obsm")
    coords = np.asarray(adata.obsm[position])
    if (
        coords.ndim != 2
        or coords.shape[0] != len(adata.obs)
        or coords.shape[1] not in (2, 3)
        or not len(coords)
    ):
        raise ValueError("Coordinates must have nonempty shape (n_obs, 2 or 3)")
    if (
        not np.issubdtype(coords.dtype, np.number)
        or np.iscomplexobj(coords)
        or not np.isfinite(coords).all()
    ):
        raise ValueError("Coordinates must be finite real numbers")
    for key in [color, section, *annotations, *continuous]:
        if key is not None:
            _obs_key(adata, key, "Selected field")
    logger.info(
        f"Resolved position={position!r}, color={color!r}, section={section!r}; {len(annotations)} annotations, {len(continuous)} numeric fields; gsMap={meta is not None}"
    )
    return ResolvedFields(position, color, section, annotations, continuous, meta)
