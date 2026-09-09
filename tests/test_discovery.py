import json

import anndata as ad
import numpy as np
import pandas as pd
import pytest

from spatialvista import vis
from spatialvista.discovery import resolve_fields, validate_gsmap
from spatialvista.exporter import export_annotations_blob, export_continuous_obs_blob


@pytest.fixture
def data():
    return ad.AnnData(
        obs=pd.DataFrame(
            {
                "celltype": pd.Categorical(["A", "B", "A", "B"]),
                "section": ["S1", "S1", "S2", "S2"],
                "score": [0.0, 2.0, np.nan, 5.0],
                "qc": [10.0, 20.0, 30.0, 40.0],
                "missing": [np.nan] * 4,
            },
            index=["a", "b", "c", "d"],
        ),
        obsm={"spatial": np.arange(12, dtype=float).reshape(4, 3)},
    )


def metadata():
    return {
        "schema_version": 1,
        "value_scale": "neg_log10_p",
        "spatial_key": "spatial",
        "section_key": "section",
        "annotation_keys": ["celltype"],
        "default_annotation": "celltype",
        "traits": {"score": "IQ"},
    }


def test_generic_discovery_and_explicit_precedence(data):
    result = resolve_fields(data)
    assert result.position == "spatial" and result.color == "celltype"
    assert result.section == "section"
    assert result.annotations == ["celltype", "section"]
    assert result.continuous == ["score", "qc"]
    assert result.gsmap is None
    data.obsm["custom"] = data.obsm["spatial"][:, :2]
    result = resolve_fields(
        data,
        position="custom",
        color="section",
        section="",
        annotations=[],
        continuous=["qc"],
    )
    assert result.position == "custom" and result.color == "section"
    assert (
        result.section is None
        and result.annotations == []
        and result.continuous == ["qc"]
    )


def test_gsmap_metadata_roundtrip_and_manifest(data, tmp_path):
    data.uns["gsmap"] = metadata()
    path = tmp_path / "gsmap.h5ad"
    data.write_h5ad(path)
    loaded = ad.read_h5ad(path)
    before = loaded.obs.copy(deep=True)
    widget = vis(loaded, _wait_for_all_sends=True)
    try:
        assert widget.global_config["GlobalConfig"]["GsMap"]
        config = widget.continuous_config["score"]
        assert config["Source"] == "gsmap" and config["Label"] == "IQ"
        assert config["Unit"] == "−log10(P)"
        assert widget.continuous_config["qc"]["Source"] == "obs"
        json.dumps(widget.continuous_config, allow_nan=False)
        np.testing.assert_allclose(
            np.frombuffer(widget.continuous_bins["score"], dtype=np.float32),
            data.obs.score,
            equal_nan=True,
        )
        pd.testing.assert_frame_equal(loaded.obs, before)
    finally:
        widget.close()


def test_no_prefix_guessing(data):
    data.obs["gsMap_logp_AF"] = 2.0
    result = resolve_fields(data)
    assert result.gsmap is None
    config, _ = export_continuous_obs_blob(data, ["gsMap_logp_AF"])
    assert config["gsMap_logp_AF"]["Source"] == "obs"


@pytest.mark.parametrize(
    "key,value",
    [
        ("schema_version", 2),
        ("schema_version", True),
        ("schema_version", 1.0),
        ("value_scale", "p"),
        ("spatial_key", "absent"),
        ("annotation_keys", "celltype"),
        ("annotation_keys", ["celltype", "celltype"]),
        ("default_annotation", "absent"),
        ("section_key", "absent"),
        ("traits", {}),
        ("traits", {"absent": "IQ"}),
        ("traits", {"score": ""}),
        ("traits", {"score": "IQ", "qc": "IQ"}),
        ("traits", {"celltype": "IQ"}),
        ("annotation_keys", np.array("celltype")),
    ],
)
def test_malformed_schema_fails(data, key, value):
    data.uns["gsmap"] = dict(metadata(), **{key: value})
    with pytest.raises(ValueError):
        resolve_fields(data)
    assert resolve_fields(data, ignore_gsmap=True).gsmap is None


@pytest.mark.parametrize(
    "values",
    [
        [-1.0, 0.0, 2.0, 3.0],
        [np.inf, 0.0, 2.0, 3.0],
        [np.nan] * 4,
        [True] * 4,
        ["0"] * 4,
        [1 + 1j] * 4,
    ],
)
def test_invalid_scores(data, values):
    data.uns["gsmap"] = metadata()
    data.obs["score"] = values
    with pytest.raises(ValueError):
        validate_gsmap(data)


def test_duplicate_spots_and_bad_coordinates(data):
    data.uns["gsmap"] = metadata()
    data.obs_names = ["a"] * 4
    with pytest.raises(ValueError, match="unique"):
        validate_gsmap(data)
    data.obs_names = list("abcd")
    data.obsm["spatial"][0, 0] = np.nan
    with pytest.raises(ValueError, match="finite"):
        validate_gsmap(data)


def test_empty_selection_overrides_metadata(data):
    data.uns["gsmap"] = metadata()
    fields = resolve_fields(
        data, annotations=[], continuous=[], section="", color="section"
    )
    assert (
        fields.annotations == [] and fields.continuous == [] and fields.section is None
    )
    widget = vis(data, continuous=[], _wait_for_all_sends=True)
    try:
        assert not widget.continuous_config
    finally:
        widget.close()


def test_missing_annotations_and_nullable_numeric(data):
    data.obs["celltype"] = pd.Categorical(["A", None, "NA", "01"])
    data.obs["nullable"] = pd.array([1, None, 3, 4], dtype="Int64")
    config, bins = export_annotations_blob(data, "celltype")
    codes = np.frombuffer(bins["celltype"], dtype=np.uint8)
    labels = [item["Name"] for item in config["AnnoMaps"]["celltype"]["Items"]]
    assert [labels[c] for c in codes] == ["A", "Unknown", "NA", "01"]
    config, bins = export_continuous_obs_blob(data, ["nullable"])
    assert np.isnan(np.frombuffer(bins["nullable"], dtype=np.float32)[1])


def test_no_annotations_does_not_modify_data(data):
    data.obs = data.obs[["score"]]
    before = data.obs.copy(deep=True)
    widget = vis(data, _wait_for_all_sends=True)
    try:
        key = widget.annotation_config["DefaultAnnoType"]
        assert (
            widget.annotation_config["AnnoMaps"][key]["Items"][0]["Name"] == "All cells"
        )
        pd.testing.assert_frame_equal(data.obs, before)
    finally:
        widget.close()


def test_large_unique_strings_not_auto_annotations():
    data = ad.AnnData(obs=pd.DataFrame({"barcode": [f"id_{i}" for i in range(100)]}))
    data.obsm["spatial"] = np.ones((100, 3))
    assert resolve_fields(data).annotations == []


def test_generic_infinite_values_fail_clearly(data):
    data.obs.loc["a", "qc"] = np.inf
    with pytest.raises(ValueError, match="finite"):
        export_continuous_obs_blob(data, ["qc"])


def test_unknown_obsm_not_silently_used_as_spatial(data):
    data.obsm["X_umap"] = data.obsm.pop("spatial")[:, :2]
    with pytest.raises(ValueError, match="infer spatial"):
        resolve_fields(data)
    assert resolve_fields(data, position="X_umap").position == "X_umap"
