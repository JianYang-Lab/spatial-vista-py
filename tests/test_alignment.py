import numpy as np
import pandas as pd

from spatialvista.widget import SpatialVistaWidget


class FakeAnnData:
    def __init__(self):
        self.obsm = {
            "spatial": np.array(
                [
                    [0.0, 0.0, 0.0],
                    [2.0, 0.0, 0.0],
                    [0.0, 0.0, 10.0],
                    [2.0, 0.0, 10.0],
                ]
            )
        }
        self.obs = pd.DataFrame({"section": ["a", "a", "b", "b"]})


def test_apply_alignment_writes_transformed_coordinates():
    adata = FakeAnnData()
    widget = SpatialVistaWidget()
    widget.set_alignment_source(adata, "spatial", "section")
    widget.alignment_transforms = {
        "z_spacing": {"mode": "fixed", "value": 100},
        "transforms": {
            "a": {"translate_x": 0, "translate_y": 0, "rotation": 0, "scale": 1},
            "b": {
                "translate_x": 5,
                "translate_y": -2,
                "rotation": 0,
                "scale": 2,
                "flip_x": True,
                "flip_y": False,
            },
        },
    }

    aligned = widget.apply_alignment("aligned")

    np.testing.assert_allclose(aligned[:2, 2], [-45, -45])
    np.testing.assert_allclose(aligned[2:, 2], [55, 55])
    np.testing.assert_allclose(aligned[2:, :2], [[8, -2], [4, -2]])
    assert adata.obsm["aligned"] is aligned
