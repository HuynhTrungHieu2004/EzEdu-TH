import os
import sys
import json
import argparse
from typing import Dict, Any

def promote_snapshot(snapshot_path: str, yes_flag: bool = False):
    print(f"Loading snapshot from: {snapshot_path}")
    
    if not os.path.exists(snapshot_path):
        print(f"Error: Snapshot file {snapshot_path} not found.")
        sys.exit(1)
        
    try:
        with open(snapshot_path, "r", encoding="utf-8") as f:
            snapshot_data = json.load(f)
    except Exception as e:
        print(f"Error: Snapshot is not a valid JSON file. {e}")
        sys.exit(1)
        
    # Validate basics of snapshot schema
    if "results" not in snapshot_data:
        print("Error: Snapshot is missing 'results' key.")
        sys.exit(1)
        
    fixture_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "mock_responses.json")
    
    # Read existing mock responses if present
    existing_mocks = {}
    if os.path.exists(fixture_path):
        try:
            with open(fixture_path, "r", encoding="utf-8") as f:
                existing_mocks = json.load(f)
        except Exception:
            print("Warning: Could not parse existing mock responses.")
            
    # Compute diff summary
    new_keys = []
    updated_keys = []
    
    for case_id, resp in snapshot_data.get("results", {}).items():
        if case_id not in existing_mocks:
            new_keys.append(case_id)
        elif existing_mocks[case_id].get("text") != resp.get("text"):
            updated_keys.append(case_id)
            
    print(f"Diff Summary:")
    print(f"  New cases to add: {len(new_keys)} ({', '.join(new_keys)})")
    print(f"  Cases to update: {len(updated_keys)} ({', '.join(updated_keys)})")
    
    if not new_keys and not updated_keys:
        print("No changes detected. Nothing to promote.")
        sys.exit(0)
        
    # Confirmation prompt or yes flag check (CI safe)
    if not yes_flag:
        # If running in non-interactive terminal (e.g. CI), default to NO
        if not sys.stdin.isatty():
            print("Non-interactive shell detected and --yes flag not provided. Aborting promote.")
            sys.exit(1)
            
        confirm = input("Are you sure you want to promote this snapshot? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("Promote cancelled.")
            sys.exit(0)
            
    # Construct updated mock responses dictionary
    for case_id, resp in snapshot_data.get("results", {}).items():
        existing_mocks[case_id] = {
            "text": resp.get("text")
        }
        
    # Write to mock responses fixture
    with open(fixture_path, "w", encoding="utf-8") as f:
        json.dump(existing_mocks, f, indent=2, ensure_ascii=False)
        
    # Update fixtures version in manifest
    manifest_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "datasets", "manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            
            # Increment minor version
            version_parts = manifest.get("fixtures_version", "1.0.0").split(".")
            if len(version_parts) == 3:
                version_parts[2] = str(int(version_parts[2]) + 1)
                manifest["fixtures_version"] = ".".join(version_parts)
                
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
                
            print(f"Manifest version updated to: {manifest['fixtures_version']}")
        except Exception as e:
            print(f"Warning: Failed to update manifest fixtures version. {e}")
            
    print("Snapshot promoted successfully to mock fixtures.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote snapshot responses to mock fixtures.")
    parser.add_argument("--snapshot", required=True, help="Path to snapshot JSON file.")
    parser.add_argument("--yes", action="store_true", help="Auto-confirm promote.")
    args = parser.parse_args()
    
    promote_snapshot(args.snapshot, args.yes)
