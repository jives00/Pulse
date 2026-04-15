#!/usr/bin/env python3
"""
Quick test: verify WeightGurus API is reachable and credentials work.
No DB writes — just auth + fetch a few recent entries.

Usage:
  python test_weightgurus_api.py --email you@example.com --password yourpassword
"""

import argparse
import hashlib
import json
import sys
from datetime import datetime, timedelta

try:
    import requests
except ImportError:
    print("ERROR: 'requests' not installed. Run: pip install requests")
    sys.exit(1)

LOGIN_V3_URL = "https://api.weightgurus.com/v3/account/login"
LOGIN_V2_URL = "https://api.weightgurus.com/v2/user/login"
LIST_URL     = "https://api.weightgurus.com/v3/operation/"

def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def login(email: str, password: str) -> str:
    # Try v3 first (plain text password, newer endpoint)
    print("   Trying v3 endpoint (plain text password)...")
    resp = requests.post(LOGIN_V3_URL, data={
        "email":    email,
        "password": password,
    }, timeout=10)
    if resp.status_code == 422:
        # Fall back to v2 (SHA-256 password)
        print("   v3 returned 422, trying v2 endpoint (SHA-256 password)...")
        resp = requests.post(LOGIN_V2_URL, data={
            "email":    email,
            "password": sha256(password),
        }, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    print(f"   Login response keys: {list(data.keys())}")
    token = data.get("token") or data.get("auth_token") or data.get("accessToken")
    if not token:
        print(f"   Full response: {json.dumps(data, indent=2)}")
        raise ValueError("No token found in login response — field name may have changed")
    return token

def fetch_entries(token: str, days_back: int = 7) -> list:
    start_ms = int((datetime.utcnow() - timedelta(days=days_back)).timestamp() * 1000)
    # v3 uses GET with Authorization header
    resp = requests.get(LIST_URL, params={"startDate": start_ms}, headers={
        "Authorization": f"Bearer {token}",
    }, timeout=10)
    if resp.status_code in (401, 404):
        # Fall back to v2 POST style
        resp = requests.post("https://api.weightgurus.com/v2/entry/list", json={
            "auth_token": token,
            "start":      str(start_ms),
        }, timeout=10)
    resp.raise_for_status()
    return resp.json()

def main():
    parser = argparse.ArgumentParser(description="Test WeightGurus API connectivity")
    parser.add_argument("--email",    required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--days",     type=int, default=7, help="How many days back to fetch (default 7)")
    args = parser.parse_args()

    print(f"\n1. Logging in as {args.email}...")
    try:
        token = login(args.email, args.password)
        print(f"   ✓ Got token: {token[:20]}...")
    except Exception as e:
        print(f"   ✗ Login failed: {e}")
        sys.exit(1)

    print(f"\n2. Fetching last {args.days} days of entries...")
    try:
        entries = fetch_entries(token, days_back=args.days)
    except Exception as e:
        print(f"   ✗ Fetch failed: {e}")
        sys.exit(1)

    if isinstance(entries, list):
        count = len(entries)
    elif isinstance(entries, dict):
        print(f"   Response is a dict, keys: {list(entries.keys())}")
        entries = entries.get("operations") or entries.get("entries") or entries.get("data") or []
        count = len(entries)
    else:
        print(f"   Unexpected response type: {type(entries)}")
        count = 0

    print(f"   ✓ Got {count} entries")

    if count > 0:
        print(f"\n3. Sample entry (most recent):")
        print(json.dumps(entries[-1], indent=4))
        print(f"\n   All keys in a sample entry: {list(entries[-1].keys()) if isinstance(entries[-1], dict) else 'N/A'}")

    print("\nDone. API appears to be working." if count >= 0 else "\nNo entries returned.")

if __name__ == "__main__":
    main()
