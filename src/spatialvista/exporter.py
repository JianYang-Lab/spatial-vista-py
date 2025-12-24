# spatialvista/exporter.py
import hashlib
import io
import time
import uuid

import laspy
import numpy as np
from loguru import logger


def _now():
    return time.perf_counter()


def write_bin(array, path):
    start = _now()
    path.parent.mkdir(parents=True, exist_ok=True)
    array.tofile(path)
    duration = _now() - start
    try:
        size = path.stat().st_size
    except Exception:
        size = None
    logger.info(
        "write_bin: wrote {} bytes to {} in {:.3f}", size, path, duration
    )


def name_to_rgb(name: str) -> tuple[int, int, int]:
    """
    Deterministically map a string to an RGB color.
    Stable across runs, machines, and order.
    """
    h = hashlib.md5(name.encode("utf-8")).hexdigest()
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)

    def lift(x):
        return int(0.6 * x + 80)

    return (lift(r), lift(g), lift(b))


def write_laz(adata, position_key, path):
    start = _now()
    # add header for LAS file
    header = laspy.LasHeader(point_format=3, version="1.2")
    # xyz in df['position'], (N,3)
    coords = np.asanyarray(adata.obsm[position_key])
    x = coords[:, 0].astype(np.float64)
    y = coords[:, 1].astype(np.float64)
    z = coords[:, 2].astype(np.float64)
    # header.offsets = [x.min(), y.min(), z.min()]

    mins = coords.min(axis=0)
    maxs = coords.max(axis=0)
    span = maxs - mins

    target_int_range = 1e7
    scales = span / target_int_range
    scales = np.maximum(scales, 1e-3)
    header.offsets = mins.tolist()
    header.scales = scales.tolist()

    # header.scales = [0.001, 0.001, 0.001]
    # header.add_extra_dim(laspy.ExtraBytesParams(name="random", type=np.int32))
    # construct las file
    las = laspy.LasData(header)

    las.x = x
    las.y = y
    las.z = z

    # 5. write
    las.write(path)

    duration = _now() - start
    n_points = coords.shape[0]
    logger.info(
        "write_laz: wrote {} points to {} in {:.3f}", n_points, path, duration
    )


def write_laz_to_bytes(adata, position_key):
    start = _now()
    buffer = io.BytesIO()
    write_laz(adata, position_key, buffer)
    data = buffer.getvalue()
    duration = _now() - start
    logger.info(
        "write_laz_to_bytes: produced {} bytes in {:.3f}", len(data), duration
    )
    return data


def export_annotations_blob(
    adata,
    region_key,
    annotations: list[str] | None = None,
):
    """
    Returns:
      config: dict
      bins: dict[str, bytes]
    """

    start_total = _now()

    if annotations is None:
        annotations = []
    all_annos = list(dict.fromkeys([region_key] + annotations))

    logger.info(
        "export_annotations_blob: starting export for region_key={}, annotations={}, n_obs={}",
        region_key,
        annotations,
        getattr(adata, "n_obs", len(adata.obs))
        if hasattr(adata, "obs")
        else None,
    )

    anno_maps = {}
    anno_bins = {}
    anno_dtypes = {}

    for anno in all_annos:
        start = _now()
        if anno not in adata.obs:
            raise KeyError(f"Annotation '{anno}' not found in adata.obs")

        values = adata.obs[anno].to_numpy()

        cats, codes = np.unique(values, return_inverse=True)

        if len(cats) < 256:
            codes = codes.astype(np.uint8, copy=False)
            dtype = "uint8"
        elif len(cats) < 65536:
            codes = codes.astype(np.uint16, copy=False)
            dtype = "uint16"
        else:
            codes = codes.astype(np.uint32, copy=False)
            dtype = "uint32"

        bin_bytes = codes.tobytes(order="C")
        anno_bins[anno] = bin_bytes
        anno_dtypes[anno] = dtype

        items = [
            {
                "Name": str(name),
                "Code": int(i),
                "Color": name_to_rgb(str(name)),
            }
            for i, name in enumerate(cats)
        ]

        anno_maps[anno] = {"Items": items}

        duration = _now() - start
        logger.info(
            "export_annotations_blob: anno={} categories={} dtype={} bytes={} took {:.3f}",
            anno,
            len(cats),
            dtype,
            len(bin_bytes),
            duration,
        )

    config = {
        "Id": str(uuid.uuid4()),
        "AvailableAnnoTypes": all_annos,
        "DefaultAnnoType": region_key,
        "AnnoMaps": anno_maps,
        "AnnoDtypes": anno_dtypes,
    }

    total_duration = _now() - start_total
    total_bytes = sum(len(b) for b in anno_bins.values())
    logger.info(
        "export_annotations_blob: finished total_bytes={} total_time={:.3f}",
        total_bytes,
        total_duration,
    )

    return config, anno_bins


def export_continuous_obs_blob(
    adata,
    keys: list[str],
):
    """
    Returns:
      traits: dict
      bins: dict[str, bytes]
    """
    start_total = _now()
    traits = {}
    bins = {}

    logger.info(
        "export_continuous_obs_blob: starting export for keys={} n_obs={}",
        keys,
        getattr(adata, "n_obs", len(adata.obs))
        if hasattr(adata, "obs")
        else None,
    )

    for key in keys:
        start = _now()
        if key not in adata.obs:
            raise KeyError(f"Continuous obs '{key}' not found in adata.obs")

        vec = adata.obs[key].to_numpy()

        if not np.issubdtype(vec.dtype, np.number):
            raise TypeError(f"Obs '{key}' is not numeric")

        vec = vec.astype(np.float32)
        bins[key] = vec.tobytes()

        traits[key] = {
            "Source": "obs",
            "DType": "float32",
            "Min": float(np.nanmin(vec)),
            "Max": float(np.nanmax(vec)),
        }
        duration = _now() - start
        logger.info(
            "export_continuous_obs_blob: key={} dtype={} bytes={} min={} max={} took {:.3f}",
            key,
            "float32",
            len(bins[key]),
            traits[key]["Min"],
            traits[key]["Max"],
            duration,
        )

    total_duration = _now() - start_total
    total_bytes = sum(len(b) for b in bins.values())
    logger.info(
        "export_continuous_obs_blob: finished total_keys={} total_bytes={} total_time={:.3f}",
        len(bins),
        total_bytes,
        total_duration,
    )

    return traits, bins


def export_continuous_gene_blob(
    adata,
    genes: list[str],
    layer: str | None = None,
    prefix: str = "Gene",
):
    """
    Returns:
      traits: dict
      bins: dict[str, bytes]
    """
    start_total = _now()
    traits = {}
    bins = {}

    X = adata.layers[layer] if layer else adata.X

    logger.info(
        "export_continuous_gene_blob: starting export for {} genes layer={}",
        len(genes),
        layer,
    )

    for gene in genes:
        start = _now()
        if gene not in adata.var_names:
            raise KeyError(f"Gene '{gene}' not found in adata.var_names")

        idx = adata.var_names.get_loc(gene)
        vec = X[:, idx]

        if hasattr(vec, "toarray"):
            vec = vec.toarray().ravel()
        else:
            vec = np.asarray(vec).ravel()

        vec = vec.astype(np.float16)

        key = f"{prefix}:{gene}"

        bins[key] = vec.tobytes()

        traits[key] = {
            "Source": "gene",
            "DType": "float16",
            "Min": float(np.nanmin(vec)),
            "Max": float(np.nanmax(vec)),
        }

        duration = _now() - start
        logger.info(
            "export_continuous_gene_blob: gene={} key={} bytes={} min={} max={} took {:.3f}",
            gene,
            key,
            len(bins[key]),
            traits[key]["Min"],
            traits[key]["Max"],
            duration,
        )

    total_duration = _now() - start_total
    total_bytes = sum(len(b) for b in bins.values())
    logger.info(
        "export_continuous_gene_blob: finished total_genes={} total_bytes={} total_time={:.3f}",
        len(genes),
        total_bytes,
        total_duration,
    )

    return traits, bins
