from .exporter import (
    export_annotations_blob,
    export_continuous_gene_blob,
    export_continuous_obs_blob,
    write_laz_to_bytes,
)
from .widget import SpatialVistaWidget


def vis(
    adata,
    position_key: str,
    region_key: str,
    annotations: list[str] | None = None,
    continuous_obs: list[str] | None = None,
    gene_list: list[str] | None = None,
    layer: str | None = None,
):
    w = SpatialVistaWidget()

    # --- LAZ ---
    laz_bytes = write_laz_to_bytes(adata, position_key)

    # --- categorical annotations ---
    anno_config, anno_bins = export_annotations_blob(
        adata,
        region_key,
        annotations,
    )

    # --- continuous obs ---
    cont_traits = {}
    cont_bins = {}

    if continuous_obs:
        cont_traits, cont_bins = export_continuous_obs_blob(
            adata,
            continuous_obs,
        )
    # --- continuous genes ---
    if gene_list:
        gene_traits, gene_bins = export_continuous_gene_blob(
            adata, gene_list, layer=layer
        )
        cont_traits.update(gene_traits)
        cont_bins.update(gene_bins)

    # --- attach to widget ---
    w.laz_bytes = laz_bytes
    w.annotation_config = anno_config
    w.annotation_bins = anno_bins

    w.continuous_config = cont_traits
    w.continuous_bins = cont_bins

    # push state
    w.send_state("laz_bytes")
    w.send_state("annotation_config")
    w.send_state("annotation_bins")
    w.send_state("continuous_config")
    w.send_state("continuous_bins")

    return w
