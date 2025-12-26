"""
SpatialVista: Interactive 3D/2D spatial data visualization for Python.
"""

from ._logger import get_logger, set_log_level
from .vis import vis

__version__ = "0.1.0"
__all__ = ["vis", "set_log_level", "get_logger"]
