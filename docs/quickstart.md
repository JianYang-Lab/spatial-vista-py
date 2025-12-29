# Quick Start

## Installation

### Requirements

- **Python**: 3.10 or higher
- **Jupyter**: Notebook or Lab

### Install with uv (Recommended)

```bash
uv pip install spatialvista
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

## Minimal Example

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

If you see an interactive 3D visualization, you're all set! 🎉

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
