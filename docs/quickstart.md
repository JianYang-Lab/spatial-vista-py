# Quick Start

## Installation

### Requirements

- **Python**: 3.10 or higher
- A modern browser with WebGL support

### Install with uv (Recommended)

```bash
uv pip install spatialvista
```

You can also run SpatialVista without installing it permanently:

```bash
uvx spatialvista --input data.h5ad
```

### Install with pip

```bash
pip install spatialvista
```

### Install from Source

```bash
git clone https://github.com/yourusername/spatial-vista-py.git
cd spatial-vista-py
uv pip install -e .
```

## Open an `.h5ad` file from the command line

```bash
spatialvista --input data.h5ad
```

SpatialVista infers common `adata.obsm` spatial keys and categorical `adata.obs` columns, starts at `http://127.0.0.1:8765`, and opens the browser. Specify keys explicitly if your file uses different names:

```bash
spatialvista --input data.h5ad \
  --position spatial \
  --color celltype \
  --section section \
  --annotations leiden,region \
  --continuous total_counts \
  --genes Pecam1,Cd3e
```

The browser interface provides the same rendering, filtering, layouts, lasso selection, section navigation, and screenshot tools as the Jupyter widget. Run `spatialvista --help` for all options. By default the server listens only on your computer; use `--host` only when you intentionally want a different network interface.

## Jupyter example

Verify your installation with this minimal example:

```python
import numpy as np
import spatialvista as spv

# Create minimal test data
class FakeAnnData:
    def __init__(self, n: int):
        self.obsm = {"spatial": np.random.rand(n, 3)}
        self.obs = {"celltype": np.random.choice(["A", "B", "C"], n)}
        self.var_names = []
        self.X = None
        self.n_obs = n

adata = FakeAnnData(n=10_000)

# Create visualization
spv.vis(adata, position="spatial", color="celltype")
```

If you see an interactive visualization, you're all set! 🎉

## Update

```bash
uv pip install --upgrade spatialvista
# or
pip install --upgrade spatialvista
```

## Next Steps

- [Controls](controls.md) - Learn how to interact with the visualization
- [API Reference](api/index.md) - Complete function documentation
- [FAQ](faq.md) - Common questions and troubleshooting
