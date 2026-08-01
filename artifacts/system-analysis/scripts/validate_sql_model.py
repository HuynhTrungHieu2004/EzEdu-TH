#!/usr/bin/env python3
"""Static checks for the CASE Studio 2 logical DDL."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SQL_PATH = ROOT / "case-studio2" / "ezedu_logical_model_mysql.sql"


def main() -> int:
    sql = SQL_PATH.read_text(encoding="utf-8")
    tables = set(re.findall(r"CREATE\s+TABLE\s+([A-Za-z0-9_]+)\s*\(", sql, re.I))
    targets = re.findall(r"REFERENCES\s+([A-Za-z0-9_]+)\s*\(", sql, re.I)
    errors: list[str] = []

    if sql.count("(") != sql.count(")"):
        errors.append(
            f"Unbalanced parentheses: {sql.count('(')} opening, {sql.count(')')} closing"
        )

    missing = sorted(set(targets) - tables)
    if missing:
        errors.append("Foreign keys reference missing tables: " + ", ".join(missing))

    trailing_comma = re.findall(r",\s*\)\s*ENGINE", sql, re.I | re.S)
    if trailing_comma:
        errors.append(f"Found {len(trailing_comma)} trailing comma(s) before table close")

    duplicate_tables = [
        name
        for name in tables
        if len(re.findall(rf"CREATE\s+TABLE\s+{re.escape(name)}\s*\(", sql, re.I)) > 1
    ]
    if duplicate_tables:
        errors.append("Duplicate CREATE TABLE definitions: " + ", ".join(duplicate_tables))

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(
        f"OK: {len(tables)} tables, {len(targets)} foreign-key references, "
        "balanced syntax delimiters."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

