from typing import Protocol


class PersonalizationRepository(Protocol):
    """Marker protocol for future personalization repositories."""

    collection_name: str
