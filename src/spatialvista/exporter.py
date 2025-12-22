# spatialvista/exporter.py
import hashlib
import io
import uuid

import laspy
import numpy as np


def write_bin(array, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    array.tofile(path)


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


def write_laz(adata, position_key, region_key, path):
    df = adata.obs.copy()
    unique_regions = df[region_key].unique()

    region_colors = {}
    for name in unique_regions:
        color = name_to_rgb(name)
        region_colors[name] = color

    # 2. add colors column
    colors = np.array([region_colors.get(r, (0, 0, 0)) for r in df[region_key]])

    # add header for LAS file
    header = laspy.LasHeader(point_format=3, version="1.2")
    # xyz in df['position'], (N,3)
    coords = np.asanyarray(adata.obsm[position_key])
    x = coords[:, 0].astype(np.float64)
    y = coords[:, 1].astype(np.float64)
    z = coords[:, 2].astype(np.float64)
    header.offsets = [x.min(), y.min(), z.min()]
    header.scales = [0.001, 0.001, 0.001]
    # header.add_extra_dim(laspy.ExtraBytesParams(name="random", type=np.int32))
    # construct las file
    las = laspy.LasData(header)

    las.x = x
    las.y = y
    las.z = z

    las.red = colors[:, 0]
    las.green = colors[:, 1]
    las.blue = colors[:, 2]

    # las.point_size = sizes
    regions = df[region_key].unique()
    region_to_id = {r: i for i, r in enumerate(regions)}
    print(region_to_id)
    las.classification = np.array(
        [region_to_id[r] for r in df[region_key]], dtype=np.uint8
    )

    # 5. write
    las.write(path)


def write_laz_to_bytes(adata, position_key, region_key):
    buffer = io.BytesIO()
    write_laz(adata, position_key, region_key, buffer)
    return buffer.getvalue()


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

    if annotations is None:
        annotations = []
    all_annos = list(dict.fromkeys([region_key] + annotations))

    anno_maps = {}
    anno_bins = {}
    anno_dtypes = {}

    for anno in all_annos:
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

        anno_bins[anno] = codes.tobytes(order="C")
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

    config = {
        "Id": str(uuid.uuid4()),
        "AvailableAnnoTypes": all_annos,
        "DefaultAnnoType": region_key,
        "AnnoMaps": anno_maps,
        "AnnoDtypes": anno_dtypes,
    }

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
    traits = {}
    bins = {}

    for key in keys:
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
    traits = {}
    bins = {}

    X = adata.layers[layer] if layer else adata.X

    for gene in genes:
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

    return traits, bins
