# Query gsMap traits

Open an exported gsMap H5AD without specifying its coordinate or annotation keys:

```bash
spatialvista --input embryo.spatialvista.h5ad
```

The viewer starts with the default annotation. **Query Traits** opens a searchable
trait list; selecting a trait colors the tissue by **−log10(P)**. Annotation
selection and section controls remain available. Ordinary numeric fields remain
under **Query Continuous**.

## Install this feature

These additions are on the fork's feature branch, not yet in the PyPI release:

```bash
pip install "git+https://github.com/Ganten-Hornby/spatial-vista-py.git@feature/gsmap-trait-discovery"
```

With the gsMap exporter installed, export an existing completed 3D report:

```bash
gsmap export-spatialvista /path/to/gsmap_project --output embryo.spatialvista.h5ad
spatialvista --input embryo.spatialvista.h5ad
```

Use repeated `--trait IQ --trait AF` options to select traits, or `--max-spots 200000`
for a reproducible preview. The export includes all spots by default, independently
of HTML report sampling, and does not rerun association analysis. It contains
coordinates, annotations and association values, not expression or marker matrices.
Future gsMap report runs can request it with `--export-spatialvista`.

In a notebook:

```python
import anndata as ad
import spatialvista as spv

adata = ad.read_h5ad("embryo.spatialvista.h5ad")
spv.vis(adata)
# Explicit options override discovered defaults:
trait_columns = list(adata.uns["gsmap"]["traits"])
spv.vis(adata, continuous=trait_columns[:1])
```

## H5AD metadata contract

Other exporters can use this versioned declaration. Trait column names are
arbitrary; discovery uses the mapping, **not a prefix**:

```python
adata.uns["gsmap"] = {
    "schema_version": 1,
    "value_scale": "neg_log10_p",
    "spatial_key": "spatial",
    "section_key": "sample_name",  # optional
    "annotation_keys": ["celltype", "region"],
    "default_annotation": "celltype",
    "traits": {
        "gsMap_logp_IQ": "IQ",
        "gsMap_logp_AF": "Atrial fibrillation",
    },
}
```

- `obsm[spatial_key]` must contain finite, real `(n_obs, 3)` coordinates.
- Observation IDs must be unique and nonempty. Coordinates, scores and annotations
  share exactly the same observation order.
- Declared columns must exist. Trait labels must be nonempty and unique.
- Traits must be real numeric, nonnegative −log10(P), with at least one finite
  value per trait. Missing values may be NaN; they render transparently.
  Infinite values and a declaration of raw P values are rejected.
- The viewer does not transform scores again. Schema validation cannot detect
  raw P values incorrectly labeled as −log10(P); the exporter is responsible
  for declaring the correct scale.
- Annotation labels, including numeric labels and missing categories, are handled
  as categories. Constant-score traits are valid.

Rendering uses float32 scores. gsMap's export retains coordinate provenance in
`coordinate_provenance_json`; ordinal section coordinates are not measured physical
distances. This feature does not modify the separately deployed SpatialVista portal.
