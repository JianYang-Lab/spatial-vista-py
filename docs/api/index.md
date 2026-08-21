# API Reference

Complete API documentation auto-generated from code docstrings.

## Main Visualization Function

::: spatialvista.vis
    options:
      show_root_heading: true
      show_source: false
      heading_level: 3

## Logging Functions

::: spatialvista.set_log_level
    options:
      show_root_heading: true
      show_source: false
      heading_level: 3

::: spatialvista.get_log_level
    options:
      show_root_heading: true
      show_source: false
      heading_level: 3

::: spatialvista.get_logger
    options:
      show_root_heading: true
      show_source: false
      heading_level: 3

## Alignment

When `vis(..., section="...")` is used, the returned widget exposes the latest frontend alignment parameters and can materialize them into AnnData:

```python
widget.alignment_parameters
aligned = widget.apply_alignment(output_key="spatial_aligned")
```

`apply_alignment` returns an `(n_obs, 3)` NumPy array and stores the same array in the source `adata.obsm` mapping.

<!--## Widget Class

::: spatialvista.widget.SpatialVistaWidget
    options:
      show_root_heading: true
      show_source: false
      heading_level: 3
      members:
        - laz_bytes
        - annotation_config
        - annotation_bins
        - continuous_config
        - continuous_bins
        - global_config-->
