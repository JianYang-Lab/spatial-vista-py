# spatialvista/_logger.py
"""
Centralized logger configuration for spatialvista package.
"""

import sys
from contextlib import contextmanager

from loguru import logger

# Remove default handler
logger.remove()

# Add custom handler with default WARNING level
_handler_id = logger.add(
    sys.stderr,
    level="WARNING",
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    colorize=True,
)

# Store current level for context manager
_current_level = "WARNING"


def set_log_level(level: str = "WARNING") -> None:
    """
    Set the logging level for the spatialvista package.

    Parameters
    ----------
    level : str, default "WARNING"
        The logging level. Valid values are:
        - "TRACE": Most verbose, shows all messages
        - "DEBUG": Debug information
        - "INFO": General information
        - "SUCCESS": Success messages
        - "WARNING": Warning messages (default)
        - "ERROR": Error messages only
        - "CRITICAL": Critical errors only

    Raises
    ------
    ValueError
        If an invalid log level is provided.

    Examples
    --------
    >>> import spatialvista as spv
    >>> spv.set_log_level("INFO")  # Show info and above
    >>> spv.set_log_level("DEBUG")  # Show debug and above
    >>> spv.set_log_level("ERROR")  # Only show errors
    """
    global _handler_id, _current_level

    # Validate level
    valid_levels = [
        "TRACE",
        "DEBUG",
        "INFO",
        "SUCCESS",
        "WARNING",
        "ERROR",
        "CRITICAL",
    ]
    level_upper = level.upper()

    if level_upper not in valid_levels:
        raise ValueError(
            f"Invalid log level: {level}. Valid levels are: {', '.join(valid_levels)}"
        )

    # Remove old handler and add new one with updated level
    logger.remove(_handler_id)
    _handler_id = logger.add(
        sys.stderr,
        level=level_upper,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        colorize=True,
    )

    _current_level = level_upper
    logger.debug(f"Log level changed to {level_upper}")


def get_log_level() -> str:
    """
    Get the current logging level.

    Returns
    -------
    str
        The current log level (e.g., "WARNING", "INFO").
    """
    return _current_level


@contextmanager
def temp_log_level(level: str):
    """
    Temporarily set a different log level within a context.

    Parameters
    ----------
    level : str
        The temporary logging level.

    Examples
    --------
    >>> import spatialvista as spv
    >>> from spatialvista._logger import temp_log_level
    >>>
    >>> # Normal WARNING level
    >>> with temp_log_level("DEBUG"):
    ...     # Inside here, DEBUG level is active
    ...     widget = spv.vis(adata, ...)
    >>> # Back to WARNING level
    """
    old_level = _current_level
    try:
        set_log_level(level)
        yield
    finally:
        set_log_level(old_level)


def disable_logging() -> None:
    """
    Disable all logging output.

    Examples
    --------
    >>> import spatialvista as spv
    >>> spv.disable_logging()  # No log output
    """
    set_log_level("CRITICAL")
    logger.disable("spatialvista")


def enable_logging(level: str = "WARNING") -> None:
    """
    Re-enable logging after it has been disabled.

    Parameters
    ----------
    level : str, default "WARNING"
        The logging level to set.
    """
    logger.enable("spatialvista")
    set_log_level(level)


def get_logger():
    """
    Get the configured logger instance.

    Returns
    -------
    logger
        The configured loguru logger instance.
    """
    return logger


# Export the logger instance for internal use
__all__ = [
    "logger",
    "set_log_level",
    "get_log_level",
    "get_logger",
    "temp_log_level",
    "disable_logging",
    "enable_logging",
]
