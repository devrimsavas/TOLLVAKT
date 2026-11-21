"""Minimal client for the CKAN Action API (used by data.toll.no)."""

from __future__ import annotations

from typing import Any

import requests

DEFAULT_TIMEOUT_SECONDS = 30


class CkanError(RuntimeError):
    """Raised when the CKAN API returns an error or an unexpected response."""


class CkanClient:
    """Reads dataset metadata from a CKAN portal.

    Only read-only actions are used, so no API key is needed.
    """

    def __init__(
        self,
        base_url: str,
        session: requests.Session | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()
        self.session.headers.setdefault("User-Agent", "tollvakt-etl/0.1")
        self.timeout = timeout

    def _action(self, action: str, **params: Any) -> Any:
        url = f"{self.base_url}/api/3/action/{action}"
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()

        try:
            payload = response.json()
        except ValueError as exc:
            raise CkanError(f"{action}: response is not JSON") from exc

        if not payload.get("success"):
            raise CkanError(f"{action}: {payload.get('error')}")

        return payload["result"]

    def list_datasets(self) -> list[str]:
        """Return the names (slugs) of all public datasets."""
        return self._action("package_list")

    def get_dataset(self, name: str) -> dict[str, Any]:
        """Return full metadata for one dataset, including its resources."""
        return self._action("package_show", id=name)
