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
