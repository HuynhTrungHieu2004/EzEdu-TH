import hashlib
import math
import re
import unicodedata
from collections import defaultdict
from typing import Iterable


def normalize_knowledge_name(name: str) -> str:
    text = (name or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^\w\s-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def token_alias_key(name: str) -> str:
    tokens = sorted(set(re.findall(r"\w+", normalize_knowledge_name(name))))
    return " ".join(tokens)


def local_text_embedding(text: str, dimension: int = 128) -> list[float]:
    vector = [0.0] * dimension
    for token in re.findall(r"\w+", normalize_knowledge_name(text)):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimension
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[index] += sign * (1.0 + digest[5] / 255.0)

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm)


def has_direct_cycle(edges: Iterable[tuple[str, str]]) -> bool:
    seen = set()
    for source, target in edges:
        if (target, source) in seen:
            return True
        seen.add((source, target))
    return False


def has_cycle(nodes: Iterable[str], edges: Iterable[tuple[str, str]]) -> bool:
    graph: dict[str, list[str]] = defaultdict(list)
    for source, target in edges:
        graph[source].append(target)

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        for next_node in graph.get(node, []):
            if visit(next_node):
                return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in nodes)


def normalize_weights(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("Q-Matrix weights must have a positive sum.")
    return {key: round(value / total, 6) for key, value in weights.items()}
