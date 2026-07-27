"""RBAC maintenance utilities.

Commands:
  - bootstrap-super-admin: create or promote a super admin account.
  - sync-legacy-users: backfill RBAC-compatible fields for existing users.
  - check-admins: print current admin and super_admin accounts.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.core.rbac import ROLE_NAMES, SUPER_ADMIN_ROLE
from app.core.security import get_password_hash
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database


def _status_for_user(user: dict[str, Any]) -> str:
    if user.get("deleted_at") is not None:
        return "deleted"
    if user.get("status") in {"active", "locked", "deleted"}:
        return user["status"]
    return "active" if user.get("is_active", True) is not False else "locked"


async def bootstrap_super_admin(args) -> None:
    await connect_to_mongo()
    try:
        db = get_database()
        now = datetime.now(timezone.utc)
        query: dict[str, Any] = {"email": args.email}
        user = await db["users"].find_one(query)

        if user:
            print(f"Found existing user {user.get('email')} with role={user.get('role', 'user')}.")
            update = {
                "role": SUPER_ADMIN_ROLE,
                "status": "active",
                "is_active": True,
                "permissions_override": user.get("permissions_override") or [],
                "deleted_at": None,
                "updated_at": now,
            }
            if args.dry_run:
                print(f"[DRY RUN] Would promote user {user['_id']} to super_admin.")
                return
            await db["users"].update_one({"_id": user["_id"]}, {"$set": update})
            print(f"Promoted {args.email} to super_admin.")
            return

        password = args.password
        if not password and not args.dry_run:
            password = getpass.getpass("Password for new super_admin: ")
        if not password or len(password) < 6:
            print("ERROR: password is required and must be at least 6 characters for new users.")
            return

        user_doc = {
            "email": args.email,
            "full_name": args.full_name,
            "hashed_password": get_password_hash(password),
            "role": SUPER_ADMIN_ROLE,
            "status": "active",
            "is_active": True,
            "permissions_override": [],
            "deleted_at": None,
            "created_at": now,
            "updated_at": now,
        }
        if args.dry_run:
            print(f"[DRY RUN] Would create super_admin user {args.email}.")
            return
        result = await db["users"].insert_one(user_doc)
        print(f"Created super_admin user {args.email} ({result.inserted_id}).")
    finally:
        await close_mongo_connection()


async def sync_legacy_users(args) -> None:
    await connect_to_mongo()
    try:
        db = get_database()
        now = datetime.now(timezone.utc)
        cursor = db["users"].find({})
        scanned = 0
        changed = 0
        async for user in cursor:
            scanned += 1
            update: dict[str, Any] = {}
            role = str(user.get("role") or "user")
            if role not in ROLE_NAMES:
                update["role"] = "user"
            if user.get("status") not in {"active", "locked", "deleted"}:
                update["status"] = _status_for_user(user)
            if "is_active" not in user:
                update["is_active"] = update.get("status", _status_for_user(user)) == "active"
            if "permissions_override" not in user or not isinstance(user.get("permissions_override"), list):
                update["permissions_override"] = []
            if "deleted_at" not in user:
                update["deleted_at"] = None
            if update:
                changed += 1
                update["updated_at"] = user.get("updated_at") or now
                print(f"{'[DRY RUN] Would update' if args.dry_run else 'Updating'} {user.get('email')} with {update}")
                if not args.dry_run:
                    await db["users"].update_one({"_id": user["_id"]}, {"$set": update})
        print(f"Scanned {scanned} users; {'would update' if args.dry_run else 'updated'} {changed}.")
    finally:
        await close_mongo_connection()


async def check_admins(args) -> None:
    await connect_to_mongo()
    try:
        db = get_database()
        query = {"role": {"$in": ["admin", SUPER_ADMIN_ROLE]}}
        if args.email:
            query["email"] = args.email
        if args.user_id:
            query["_id"] = ObjectId(args.user_id)
        docs = await db["users"].find(query, {"hashed_password": 0}).sort("role", 1).to_list(500)
        if not docs:
            print("No admin or super_admin accounts found.")
            return
        for user in docs:
            print(
                f"{user['_id']} | {user.get('email')} | role={user.get('role')} | "
                f"status={_status_for_user(user)} | is_active={user.get('is_active', True)}"
            )
    finally:
        await close_mongo_connection()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EzEdu AI RBAC administration utilities.")
    sub = parser.add_subparsers(dest="command", required=True)

    bootstrap = sub.add_parser("bootstrap-super-admin")
    bootstrap.add_argument("--email", required=True)
    bootstrap.add_argument("--full-name", default="Super Admin")
    bootstrap.add_argument("--password")
    bootstrap.add_argument("--dry-run", action="store_true")
    bootstrap.set_defaults(func=bootstrap_super_admin)

    sync = sub.add_parser("sync-legacy-users")
    sync.add_argument("--dry-run", action="store_true")
    sync.set_defaults(func=sync_legacy_users)

    check = sub.add_parser("check-admins")
    check.add_argument("--email")
    check.add_argument("--user-id")
    check.set_defaults(func=check_admins)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    asyncio.run(args.func(args))


if __name__ == "__main__":
    main()
