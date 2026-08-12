import json
import threading
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

import numpy as np
import pandas as pd

from spatialvista.cli import (
    _infer_color,
    _infer_position,
    _make_handler,
    _split_values,
)


class FakeAnnData:
    def __init__(self):
        self.obsm = {"spatial": np.zeros((3, 3))}
        self.obs = pd.DataFrame({"celltype": pd.Categorical(["a", "b", "a"])})


def test_cli_value_and_key_inference():
    adata = FakeAnnData()
    assert _split_values(["a,b", "c"]) == ["a", "b", "c"]
    assert _infer_position(adata) == "spatial"
    assert _infer_color(adata) == "celltype"


def test_server_serves_manifest_and_binary():
    manifest = {"global_config": {"GlobalConfig": {"Mode": "3D"}}}
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), _make_handler(manifest, {"laz": b"point-data"})
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        connection = HTTPConnection("127.0.0.1", server.server_port)
        connection.request("GET", "/api/manifest")
        response = connection.getresponse()
        assert response.status == 200
        assert json.loads(response.read()) == manifest

        connection.request("GET", "/api/binary/laz")
        response = connection.getresponse()
        assert response.status == 200
        assert response.read() == b"point-data"
    finally:
        server.shutdown()
        server.server_close()
