from urllib.parse import urlsplit

from app.curriculum_kb.schemas.dataset import CatalogSource
from app.curriculum_kb.services.crawler_service import normalize_public_url


_ALLOWED_POLICIES = {
    ("datafiles.chinhphu.vn", "moet_pdf", "official-public"),
    ("en.wikibooks.org", "wikibooks", "CC-BY-SA-4.0"),
    ("openstax.org", "openstax", "CC-BY-NC-SA-4.0"),
}


def source_policy_rejection(entry: CatalogSource) -> str | None:
    try:
        normalized = normalize_public_url(str(entry.url))
    except ValueError:
        return "invalid_public_url"
    hostname = urlsplit(normalized).hostname or ""
    if hostname != entry.canonical_domain.lower():
        return "canonical_domain_mismatch"
    if (hostname, entry.adapter, entry.license_id) not in _ALLOWED_POLICIES:
        return "license_not_allowlisted"
    if entry.noncommercial_only and not entry.demo_disposal_required:
        return "noncommercial_disposal_not_required"
    return None
