import time

from loguru import logger

from .exporter import (
    export_annotations_blob,
    export_continuous_gene_blob,
    export_continuous_obs_blob,
    write_laz_to_bytes,
)
from .widget import SpatialVistaWidget


def _now():
    return time.perf_counter()


def vis(
    adata,
    position_key: str,
    region_key: str,
    annotations: list[str] | None = None,
    continuous_obs: list[str] | None = None,
    gene_list: list[str] | None = None,
    layer: str | None = None,
    height: int = 600,  ## height of the widget, unit px
):
    start_total = _now()
    logger.info(
        "vis: starting export position_key={} region_key={} n_annotations={} n_continuous_obs={} n_genes={}",
        position_key,
        region_key,
        len(annotations) if annotations else 0,
        len(continuous_obs) if continuous_obs else 0,
        len(gene_list) if gene_list else 0,
    )

    w = SpatialVistaWidget()

    # --- LAZ ---
    t0 = _now()
    laz_bytes = write_laz_to_bytes(adata, position_key)
    t_laz = _now() - t0
    logger.info(
        "vis: write_laz_to_bytes produced {} bytes in {:.3f}s",
        len(laz_bytes),
        t_laz,
    )
    # immediately attach & sync LAZ so frontend can start receiving it
    w.laz_bytes = laz_bytes
    w.send_state("laz_bytes")
    logger.info("vis: started sync of laz_bytes ({:,} bytes)", len(laz_bytes))

    # --- categorical annotations ---
    t0 = _now()
    anno_config, anno_bins = export_annotations_blob(
        adata,
        region_key,
        annotations,
    )
    t_ann = _now() - t0
    total_anno_bytes = (
        sum(len(b) for b in anno_bins.values()) if anno_bins else 0
    )
    logger.info(
        "vis: export_annotations_blob produced {} bins total_bytes={} in {:.3f}s",
        len(anno_bins),
        total_anno_bytes,
        t_ann,
    )
    # immediately attach & sync annotation config + bins
    w.annotation_config = anno_config
    w.send_state("annotation_config")
    w.annotation_bins = anno_bins
    w.send_state("annotation_bins")
    logger.info("vis: started sync of annotation_config and annotation_bins")

    # --- continuous obs ---
    cont_traits = {}
    cont_bins = {}
    cont_obs_bytes = 0
    if continuous_obs:
        t0 = _now()
        cont_traits, cont_bins = export_continuous_obs_blob(
            adata,
            continuous_obs,
        )
        t_cont = _now() - t0
        cont_obs_bytes = (
            sum(len(b) for b in cont_bins.values()) if cont_bins else 0
        )
        logger.info(
            "vis: export_continuous_obs_blob produced {} bins total_bytes={} in {:.3f}s",
            len(cont_bins),
            cont_obs_bytes,
            t_cont,
        )

    # --- continuous genes ---
    gene_bytes = 0
    if gene_list:
        t0 = _now()
        gene_traits, gene_bins = export_continuous_gene_blob(
            adata, gene_list, layer=layer
        )
        t_genes = _now() - t0
        cont_traits.update(gene_traits)
        cont_bins.update(gene_bins)
        gene_bytes = sum(len(b) for b in gene_bins.values()) if gene_bins else 0
        logger.info(
            "vis: export_continuous_gene_blob produced {} genes total_bytes={} in {:.3f}s",
            len(gene_list),
            gene_bytes,
            t_genes,
        )

        # immediately attach & sync continuous config + bins
        w.continuous_config = cont_traits
        w.send_state("continuous_config")
        w.continuous_bins = cont_bins
        w.send_state("continuous_bins")
        logger.info(
            "vis: started sync of annotation_config and annotation_bins"
        )

    return w
