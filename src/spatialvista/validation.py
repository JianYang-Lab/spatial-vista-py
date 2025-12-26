"""Input validation utilities."""

# from typing import Optional


def validate_mode(mode: str) -> None:
    """Validate visualization mode."""
    valid_modes = ["2D", "3D"]
    if mode not in valid_modes:
        raise ValueError(
            f"Invalid mode: {mode}. Valid modes are: {', '.join(valid_modes)}"
        )


def validate_adata_key(adata, key: str, key_type: str = "obs") -> None:
    """
    Validate that a key exists in AnnData object.

    Parameters
    ----------
    adata : AnnData
        The annotated data object.
    key : str
        The key to validate.
    key_type : str
        Type of key: "obs", "var", or "obsm".
    """
    if key_type == "obs":
        if key not in adata.obs:
            raise KeyError(f"Key '{key}' not found in adata.obs")
    elif key_type == "var":
        if key not in adata.var_names:
            raise KeyError(f"Gene '{key}' not found in adata.var_names")
    elif key_type == "obsm":
        if key not in adata.obsm:
            raise KeyError(f"Key '{key}' not found in adata.obsm")
    else:
        raise ValueError(f"Invalid key_type: {key_type}")


def validate_height(height: int) -> None:
    """Validate widget height."""
    if not isinstance(height, int) or height <= 0:
        raise ValueError(f"Height must be a positive integer, got {height}")
