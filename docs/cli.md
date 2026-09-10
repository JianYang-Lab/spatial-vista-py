# Command-line interface

SpatialVista can open an AnnData `.h5ad` file directly in a browser, without Jupyter or a Python script.

## Run with uvx

`uvx` downloads SpatialVista into an isolated environment and launches it without a permanent installation:

```bash
uvx spatialvista --input data.h5ad
```

## Run an installed command

```bash
pip install spatialvista
spatialvista --input data.h5ad
```

The server listens at `http://127.0.0.1:8765` and opens a browser automatically. Stop it with `Ctrl+C`.

## Data options

When an option is omitted, both the CLI and Python `vis(adata)` use the same
discovery rules:

1. Explicit options take priority.
2. A valid `uns["gsmap"]` declaration supplies gsMap-specific defaults.
3. Otherwise, common spatial and section keys, categorical annotations and
   real numeric `obs` columns are discovered automatically.

### AnnData conventions

| Data | Location and convention | Viewer |
| --- | --- | --- |
| Tissue coordinates | `obsm["spatial"]`: finite numeric array of shape `(n_obs, 2)` or `(n_obs, 3)` | Spatial map |
| Annotations | `obs`: categorical or boolean columns; string columns with a limited number of distinct labels | Annotation selection |
| Continuous measurements | `obs`: real integer or floating-point columns with at least one finite value, excluding selected annotations, the color field and section identifiers | Query Continuous |
| Section identifiers | `obs["sample_name"]` or another recognized section key | Section controls |
| gsMap associations | Numeric `obs` columns explicitly declared in `uns["gsmap"]["traits"]`; values are already −log10(P) | Query Traits |

All arrays and columns must refer to the same cells in the same `obs` row order.
An expression matrix is optional for coordinates, annotations and continuous
fields. Numeric-looking strings are not automatically converted to measurements.
For numeric cell-type codes, set the intended type before saving:

```python
adata.obs["celltype"] = adata.obs["celltype"].astype("category")
adata.obs["score"] = adata.obs["score"].astype("float32")
adata.write_h5ad("sample.h5ad")
```

Automatic string annotations require at most
`min(1000, max(20, n_obs // 5))` distinct nonmissing labels. Explicit categorical
columns do not use this threshold. Missing annotation labels become “Unknown”;
missing numeric values remain NaN and render transparently. Infinite numeric
values are rejected when exported to the viewer.

Coordinate discovery recognizes `spatial`, `spatial_3d`, `spatial_aligned`,
`spatial_algined`, `X_spatial`, `position` and `coordinates`, in that order.
It does not interpret a UMAP as tissue coordinates. If no annotation is found,
the viewer starts with one “All cells” category. High-cardinality free-text
columns are not automatically used as annotations; numeric category codes should
be made categorical or selected explicitly with `--annotations`.

Use `--continuous ""` to disable automatic numeric fields, `--annotations ""`
to disable additional annotations, or `--section ""` to disable section discovery.
The Python equivalents are `continuous=[]`, `annotations=[]` and `section=""`.
The default color annotation is retained when additional annotations are disabled.
Gene expression is exported **only** when `--genes` / `genes=` is supplied.

For gsMap files, see [Query gsMap traits](gsmap.md). Invalid gsMap metadata
raises an error before serving the viewer. Use `--ignore-gsmap-metadata` only
to deliberately open that file as ordinary AnnData; it disables gsMap trait mode.

SpatialVista recognizes common coordinate keys such as `spatial` and common annotation keys such as `celltype`, `annotation`, or `leiden`. For reproducible commands, set them explicitly:

```bash
spatialvista --input sample.h5ad \
  --position spatial \
  --color celltype \
  --section slice_id \
  --annotations leiden,tissue_region \
  --continuous total_counts,n_genes_by_counts \
  --genes PECAM1,CD3E \
  --layer normalized
```

Repeat list options or provide comma-separated values. For example, `--genes PECAM1 --genes CD3E` and `--genes PECAM1,CD3E` are equivalent.

## Server options

```text
--host HOST       Listening interface (default: 127.0.0.1)
--port PORT       Listening port (default: 8765; use 0 for an available port)
--no-browser      Do not open the browser automatically
--mode {2D,3D}    Initial visualization mode
--height HEIGHT   Visualization height in pixels
```

The default loopback address keeps the server accessible only from the same computer. Binding another host can expose the data over a network and should be done intentionally.
