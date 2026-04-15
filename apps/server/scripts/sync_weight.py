#!/usr/bin/env python3
"""
WeightGurus → Pulse body_measurements sync.

Fetches the last N days from the WeightGurus v3 API and upserts into
body_measurements. Safe to run repeatedly — skips rows that already exist
for the same (user_id, metric, measured_at) date.

Usage:
  python sync_weight.py                   # reads creds from .env, syncs last 7 days
  python sync_weight.py --days 30         # sync last 30 days
  python sync_weight.py --dry-run         # print what would be inserted, no DB writes

.env file (apps/server/.env) must contain:
  WG_EMAIL=your@email.com
  WG_PASSWORD=yourpassword
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
  WG_USER_ID=1   (optional, defaults to 1)
"""

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: pip install requests")
    sys.exit(1)

try:
    import pymysql
except ImportError:
    print("ERROR: pip install pymysql")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LOGIN_URL = "https://api.weightgurus.com/v3/account/login"
OPS_URL   = "https://api.weightgurus.com/v3/operation/"

# WeightGurus stores values as integers scaled ×10
SCALE = 10.0

# Map API field → (metric name in DB, unit)
FIELD_MAP = {
    "weight":     ("weight",      "lb"),
    "bodyFat":    ("body_fat",    "%"),
    "muscleMass": ("muscle_mass", "%"),
    "water":      ("water",       "%"),
    "bmi":        ("bmi",         ""),
}


def load_env():
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------------------
# WeightGurus API
# ---------------------------------------------------------------------------

def wg_login(email: str, password: str) -> str:
    resp = requests.post(LOGIN_URL, data={"email": email, "password": password}, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    token = data.get("accessToken") or data.get("token") or data.get("auth_token")
    if not token:
        raise ValueError(f"No token in login response: {list(data.keys())}")
    return token


def wg_fetch(token: str, days_back: int) -> list[dict]:
    start_ms = int((datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp() * 1000)
    resp = requests.get(OPS_URL, params={"startDate": start_ms}, headers={
        "Authorization": f"Bearer {token}",
    }, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    ops = data.get("operations", data) if isinstance(data, dict) else data
    # Only process "create" operations (not deletes/updates)
    return [o for o in ops if o.get("operationType") == "create"]


# ---------------------------------------------------------------------------
# DB upsert
# ---------------------------------------------------------------------------

def get_db(cfg: dict):
    return pymysql.connect(
        host=cfg["DB_HOST"],
        port=int(cfg.get("DB_PORT", 3306)),
        user=cfg["DB_USER"],
        password=cfg["DB_PASSWORD"],
        database=cfg["DB_NAME"],
        autocommit=False,
    )


def upsert_entries(conn, entries: list[dict], user_id: int, dry_run: bool) -> int:
    """
    Insert each metric from each entry. Skips if a row already exists for
    (user_id, metric, measured_at). Returns count of rows inserted.
    Loads existing rows in one query to avoid per-row SELECT round trips.
    """
    with conn.cursor() as cur:
        # Load all existing (metric, measured_at) pairs in one shot
        cur.execute(
            "SELECT metric, measured_at FROM body_measurements WHERE user_id=%s",
            (user_id,)
        )
        existing = {(row[0], str(row[1])) for row in cur.fetchall()}

        rows_to_insert = []
        for entry in entries:
            ts = entry.get("entryTimestamp", "")
            if not ts:
                continue
            measured_at = ts[:10]  # "YYYY-MM-DD"

            for field, (metric, unit) in FIELD_MAP.items():
                raw = entry.get(field)
                if raw is None or raw == 0:
                    continue
                if (metric, measured_at) in existing:
                    continue
                value = round(raw / SCALE, 1)
                rows_to_insert.append((user_id, metric, value, unit, measured_at))

        if dry_run:
            for row in rows_to_insert:
                print(f"  [dry-run] INSERT {row[4]} {row[1]}={row[2]} {row[3]}")
            return len(rows_to_insert)

        if rows_to_insert:
            cur.executemany(
                "INSERT INTO body_measurements (user_id, metric, value, unit, measured_at) "
                "VALUES (%s, %s, %s, %s, %s)",
                rows_to_insert,
            )
            conn.commit()

        return len(rows_to_insert)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Sync WeightGurus → Pulse body_measurements")
    parser.add_argument("--days",    type=int, default=7, help="Days back to fetch (default 7)")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing to DB")
    args = parser.parse_args()

    load_env()

    email    = os.environ.get("WG_EMAIL")
    password = os.environ.get("WG_PASSWORD")
    user_id  = int(os.environ.get("WG_USER_ID", "1"))

    if not email or not password:
        print("ERROR: WG_EMAIL and WG_PASSWORD must be set in .env or environment")
        sys.exit(1)

    for key in ("DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"):
        if not os.environ.get(key):
            print(f"ERROR: {key} must be set in .env or environment")
            sys.exit(1)

    print(f"Logging in to WeightGurus as {email}...")
    token = wg_login(email, password)
    print(f"  ✓ Authenticated")

    print(f"Fetching last {args.days} days of entries...")
    entries = wg_fetch(token, days_back=args.days)
    print(f"  ✓ Got {len(entries)} entries")
    if entries:
        print(f"  Date range: {entries[0].get('entryTimestamp','?')[:10]} → {entries[-1].get('entryTimestamp','?')[:10]}")
        print(f"  Sample entry: {entries[-1]}")

    if not entries:
        print("Nothing to sync.")
        return

    if args.dry_run:
        print("Dry run — no DB writes:\n")

    conn = get_db(os.environ)
    try:
        inserted = upsert_entries(conn, entries, user_id, dry_run=args.dry_run)
    finally:
        conn.close()

    label = "would insert" if args.dry_run else "inserted"
    print(f"\nDone. {label} {inserted} rows into body_measurements.")


if __name__ == "__main__":
    main()
