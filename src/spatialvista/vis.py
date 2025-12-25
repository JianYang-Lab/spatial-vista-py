import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from loguru import logger

from .exporter import (
    export_annotations_blob,
    export_continuous_gene_blob,
    export_continuous_obs_blob,
    write_laz_to_bytes,
)
from .widget import SpatialVistaWidget

logger.remove(0)

logger.add(sys.stdout, level="WARNING")


def _now():
    return time.perf_counter()


def _size_of_value(v: Any) -> int:
    if v is None:
        return 0
    if isinstance(v, (bytes, bytearray, memoryview)):
        return len(v)
    if isinstance(v, dict):
        # assume dict values are bytes-like for bin traits
        try:
            return sum(len(x) for x in v.values())
        except Exception:
            return len(v)
    try:
        return len(v)
    except Exception:
        return 0


def _async_set_trait_and_send(
    widget: SpatialVistaWidget, trait_name: str, value: Any
):
    """
    Background worker: set trait and call send_state for that trait.
    This function deliberately swallows exceptions and logs them, to avoid crashing the worker.
    """
    try:
        t0 = time.perf_counter()
        setattr(widget, trait_name, value)
        # call send_state to trigger trait syncing to frontend
        widget.send_state(trait_name)
        dur = time.perf_counter() - t0
        logger.info(
            "async_send: trait='{}' size={} took {:.3f}s (dispatched in background)",
            trait_name,
            _size_of_value(value),
            dur,
        )
    except Exception as e:
        logger.exception(
            "async_send: failed to send trait='{}': {}", trait_name, e
        )


def vis(
    adata,
    position_key: str,
    color_key: str,
    slice_key: str | None = None,
    annotations: list[str] | None = None,
    continuous_obs: list[str] | None = None,
    gene_list: list[str] | None = None,
    layer: str | None = None,
    height: int = 600,  ## height of the widget, unit px
    _async_workers: int = 2,
    _wait_for_all_sends: bool = False,
):
    """
    If _wait_for_all_sends is True, the function will block until all background sends finish.
    Otherwise it will return the widget immediately while sends may continue in background.
    """
    start_total = _now()
    logger.info(
        "vis: starting export position_key={} region_key={} n_annotations={} n_continuous_obs={} n_genes={}",
        position_key,
        color_key,
        len(annotations) if annotations else 0,
        len(continuous_obs) if continuous_obs else 0,
        len(gene_list) if gene_list else 0,
    )

    w = SpatialVistaWidget()

    # create a small thread pool for background sends
    executor = ThreadPoolExecutor(max_workers=_async_workers)
    futures = []

    # --- GlobalConfig (send height to frontend early) ---
    global_cfg = {
        "GlobalConfig": {"Height": int(height), "SliceKey": slice_key}
    }
    futures.append(
        executor.submit(
            _async_set_trait_and_send, w, "global_config", global_cfg
        )
    )
    logger.info("vis: dispatched async send for global_config: {}", global_cfg)

    # --- LAZ ---
    t0 = _now()
    laz_bytes = write_laz_to_bytes(adata, position_key)
    t_laz = _now() - t0
    logger.info(
        "vis: write_laz_to_bytes produced {} bytes in {:.3f}s",
        len(laz_bytes),
        t_laz,
    )

    # dispatch LAZ send in background
    futures.append(
        executor.submit(_async_set_trait_and_send, w, "laz_bytes", laz_bytes)
    )
    logger.info(
        "vis: dispatched async send for laz_bytes ({} bytes)", len(laz_bytes)
    )

    # --- categorical annotations ---
    t0 = _now()
    anno_config, anno_bins = export_annotations_blob(
        adata,
        color_key,
        slice_key,
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

    # dispatch annotation config and bins asynchronously
    futures.append(
        executor.submit(
            _async_set_trait_and_send, w, "annotation_config", anno_config
        )
    )
    futures.append(
        executor.submit(
            _async_set_trait_and_send, w, "annotation_bins", anno_bins
        )
    )
    logger.info(
        "vis: dispatched async send for annotation_config and annotation_bins ({} bytes)",
        total_anno_bytes,
    )

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

        # dispatch continuous config and bins asynchronously
        futures.append(
            executor.submit(
                _async_set_trait_and_send, w, "continuous_config", cont_traits
            )
        )
        futures.append(
            executor.submit(
                _async_set_trait_and_send, w, "continuous_bins", cont_bins
            )
        )
        logger.info(
            "vis: dispatched async send for continuous_config and continuous_bins ({} bytes)",
            cont_obs_bytes,
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

        futures.append(
            executor.submit(
                _async_set_trait_and_send, w, "continuous_config", cont_traits
            )
        )
        futures.append(
            executor.submit(
                _async_set_trait_and_send, w, "continuous_bins", cont_bins
            )
        )
        logger.info(
            "vis: dispatched async send for updated continuous_config/continuous_bins ({} bytes)",
            gene_bytes,
        )

    # Optionally wait for all background sends to finish before returning
    if _wait_for_all_sends:
        logger.info(
            "vis: waiting for {} background send tasks to complete",
            len(futures),
        )
        for fut in as_completed(futures, timeout=None):
            try:
                fut.result()
            except Exception as e:
                logger.exception("vis: background send task raised: {}", e)
        logger.info("vis: all background sends completed")

    # shutdown executor but let running tasks finish (daemon threads not used)
    executor.shutdown(wait=False)

    total_time = _now() - start_total
    total_bytes = (
        len(laz_bytes) + total_anno_bytes + cont_obs_bytes + gene_bytes
    )
    logger.info(
        "vis: finished (dispatch phase) total_bytes={} total_time={:.3f}s background_tasks={}",
        total_bytes,
        total_time,
        len(futures),
    )

    return w
