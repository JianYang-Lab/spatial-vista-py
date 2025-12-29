# Frequently Asked Questions (FAQ)

## Installation & Environment

### Cannot import spatialvista in Jupyter?

This is usually a **kernel environment issue**. The package is installed in one Python environment, but Jupyter is using a different kernel.

**Solution:**

```python
# Check which Python your kernel is using
import sys
print(sys.executable)

# Check if spatialvista is installed in this environment
import subprocess
subprocess.run([sys.executable, "-m", "pip", "list"])
```

If spatialvista is not listed, install it in the correct environment:

```bash
# Install in the same environment as your Jupyter kernel
python -m pip install spatialvista

# Or with uv
uv pip install spatialvista
```

**Alternative:** Create a new kernel for your environment:

```bash
# Activate your environment first, then:
python -m ipykernel install --user --name=myenv --display-name="Python (myenv)"
```

Then select this kernel in Jupyter.

### Widget not displaying?

Try in order:

1. **Restart Jupyter kernel** (Kernel → Restart)
2. **Clear browser cache** and refresh page
3. **Check browser console** for errors (press F12)
4. **Try Chrome or Firefox** (best compatibility)
5. **(JupyterLab only)** Run `jupyter lab build` and restart

## Data & Coordinates

### Why do my coordinates look different in the visualization?

SpatialVista uses **LAZ format** for efficient point cloud storage, which applies **scale and offset transformations** to compress coordinates into integers.

**What happens:**

1. Your original coordinates (e.g., `[1234.567, 890.123, 456.789]`)
2. Are transformed: `int((coord - offset) / scale)`
3. Stored as integers for compression
4. Reconstructed on display: `coord_display = int_value * scale + offset`

**This means:**

- Coordinates are **slightly quantized** (small precision loss)
- Visual positions are **functionally identical** to originals
- The transformation is **automatic and reversible**

**Check the transformation:**

```python
# Your original coordinates
print(adata.obsm["spatial"].min(axis=0))  # [min_x, min_y, min_z]
print(adata.obsm["spatial"].max(axis=0))  # [max_x, max_y, max_z]

# These become the offset and are used to calculate scale
```

**Why does this matter?**

- Very large coordinate values (>10^6) work fine
- Very small scales (<10^-6) may lose precision
- For 99% of spatial data, this is transparent

### `KeyError` for position or annotation keys?

The specified key doesn't exist in your data.

**Solution:**

```python
# Check available keys
print("Position keys:", adata.obsm.keys())
print("Annotation keys:", adata.obs.columns.tolist())

# Use correct keys
widget = spv.vis(adata, position="your_actual_key", color="your_annotation")
```

## Performance & Best Practices

### Widget loading is slow or browser freezes?

**Don't load everything at once!** Load only what you need initially, then reload with different parameters.

**Bad practice (loads too much):**

```python
# This loads 50+ annotations + 100 genes = very slow!
widget = spv.vis(
    adata,
    position="spatial",
    color="celltype",
    annotations=list(adata.obs.columns),  # ❌ All annotations
    genes=list(adata.var_names[:100])     # ❌ 100 genes
)
```

**Good practice (load incrementally):**

```python
# Step 1: Start with basics
widget = spv.vis(
    adata,
    position="spatial",
    color="celltype",
    annotations=["leiden"]  # Just 1-2 extra annotations
)

# Step 2: Later, reload with genes
widget = spv.vis(
    adata,
    position="spatial",
    color="celltype",
    genes=["Gene1", "Gene2", "Gene3"]  # Just a few genes
)

# Step 3: Or reload with continuous values
widget = spv.vis(
    adata,
    position="spatial",
    color="celltype",
    continuous=["total_counts", "n_genes"]  # Just key QC metrics
)
```

**Why?**

- Each annotation/gene/continuous value is **transferred to the browser**
- Too much data = **slow transfer + high memory usage**
- **Reloading with new parameters is fast** - just create a new widget

**Recommended limits:**

- Annotations: **3-5 max** per widget
- Genes: **5-10 max** per widget
- Continuous values: **3-5 max** per widget
<!--- Total cells: **<1M for smooth performance**-->

### Large dataset causing memory errors?

**Downsample before visualization:**

```python
import scanpy as sc

# Option 1: Keep a fraction
sc.pp.subsample(adata, fraction=0.5)  # 50% of cells

# Option 2: Keep exact number
sc.pp.subsample(adata, n_obs=100000)  # 100k cells

# Then visualize
widget = spv.vis(adata, position="spatial", color="celltype")
```


## Logging & Debugging

### Enable detailed logging?

Useful for debugging data loading issues:

```python
import spatialvista as spv

spv.set_log_level("INFO")  # See data transfer progress
# or
spv.set_log_level("DEBUG")  # See everything

widget = spv.vis(adata, position="spatial", color="celltype")
```

### Disable logging?

```python
spv.disable_logging()
# or
spv.set_log_level("ERROR")  # Only show errors
```


## Support

### Need help?

1. **Check the docs**: [API Reference](api/index.md) | [Controls Guide](controls.md)
2. **Report bugs**: [GitHub Issues](https://github.com/yourusername/spatial-vista-py/issues)
3. **Include**: Error message, minimal example, Python/OS/browser info, DEBUG log

---
