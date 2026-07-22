import re
from typing import List, Dict, Any, Set

def parse_inline_citations(text: str) -> List[str]:
    """
    Extracts citation tags like [DOC_1] or [WEB_2] from the answer text.
    """
    return re.findall(r'\[(DOC_\d+|WEB_\d+)\]', text)

def validate_citations(
    text: str,
    internal_citations: List[Dict[str, Any]],
    web_citations: List[Dict[str, Any]],
    allowed_domains: List[str] = None
) -> Dict[str, Any]:
    """
    Validates citation mapping, fake source_ids, hallucinated URLs, and XSS risks.
    """
    tags = parse_inline_citations(text)
    
    valid_source_ids = set()
    internal_ids = set()
    web_ids = set()
    
    for c in internal_citations:
        sid = c.get("source_id")
        if sid:
            valid_source_ids.add(sid)
            internal_ids.add(sid)
            
    for w in web_citations:
        sid = w.get("source_id")
        if sid:
            valid_source_ids.add(sid)
            web_ids.add(sid)

    invalid_tags = []
    unsafe_links = []
    hallucinated_urls = []
    
    # Check XSS and general safety on web citations
    for w in web_citations:
        url = (w.get("url") or "").strip().lower()
        if url.startswith("javascript:"):
            unsafe_links.append(url)
            
        # Check domain restrictions if any
        if allowed_domains and url:
            from urllib.parse import urlparse
            domain = urlparse(url).netloc
            if not any(d in domain for d in allowed_domains):
                hallucinated_urls.append(url)

    # Check for hallucinated source IDs cited in text
    for tag in tags:
        if tag not in valid_source_ids:
            invalid_tags.append(tag)

    return {
        "passed": len(invalid_tags) == 0 and len(unsafe_links) == 0 and len(hallucinated_urls) == 0,
        "cited_tags": tags,
        "invalid_tags": invalid_tags,
        "unsafe_links": unsafe_links,
        "hallucinated_urls": hallucinated_urls
    }

def deduplicate_urls(urls: List[str]) -> List[str]:
    """
    Deduplicates URLs in a stable ordering.
    """
    seen = set()
    res = []
    for u in urls:
        u_clean = u.strip()
        if u_clean and u_clean not in seen:
            seen.add(u_clean)
            res.append(u_clean)
    return res
