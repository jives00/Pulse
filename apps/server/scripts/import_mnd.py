#!/usr/bin/env python3
"""
MyNetDiary nutrition + water import script.

Usage:
  python import_mnd.py --food-file MyNetDiary_Year_2026-food.csv --water-file MyNetDiary_Year_2026-water.csv
  python import_mnd.py --food-file MyNetDiary_Year_2026-food.csv --from-date 2026-04-09
  python import_mnd.py --food-file ... --water-file ... --exec   # write directly to DB
  python import_mnd.py --food-file ... --user-id 2

Default: outputs import_mnd_food.sql / import_mnd_water.sql
With --exec: writes directly to the DB (same credentials as import_hevy.py)
"""

import csv
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path

DB = dict(host="127.0.0.1", port=3307, user="pulseuser",
          password="x!gMEqM3uCzaQ", database="pulse")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_EXCEL_EPOCH = datetime(1899, 12, 30)


def excel_serial_to_date(serial_str):
    serial = float(serial_str)
    dt = _EXCEL_EPOCH + timedelta(days=serial)
    return dt.strftime('%Y-%m-%d')


def parse_mnd_datetime(s):
    """Parse '03 11 2026 6:44 PM' or Excel serial '46102.67639' -> 'YYYY-MM-DD'"""
    s = s.strip()
    m = re.match(r'(\d+)\s+(\d+)\s+(\d+)\s+(\d+):(\d+)\s+(AM|PM)', s)
    if m:
        mon, day, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{yr:04d}-{mon:02d}-{day:02d}"
    m2 = re.match(r'^\d+(\.\d+)?$', s)
    if m2:
        return excel_serial_to_date(s)
    raise ValueError(f"Cannot parse datetime: {s!r}")


def parse_mnd_date(s):
    """Parse '03 11 2026' -> '2026-03-11'"""
    parts = s.strip().split()
    if len(parts) != 3:
        raise ValueError(f"Cannot parse date: {s!r}")
    mon, day, yr = int(parts[0]), int(parts[1]), int(parts[2])
    return f"{yr:04d}-{mon:02d}-{day:02d}"


def sql_str(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def parse_float(v, default=0.0):
    if v is None or str(v).strip() == '':
        return default
    try:
        return round(float(v), 4)
    except ValueError:
        return default


def meal_map(mnd_meal):
    m = mnd_meal.strip().lower()
    if m == 'breakfast': return 'breakfast'
    if m == 'lunch':     return 'lunch'
    if m == 'dinner':    return 'dinner'
    return 'snack'


# ---------------------------------------------------------------------------
# Food import
# ---------------------------------------------------------------------------

WATER_FOOD_ID = '14429'
WATER_NAME_RE = re.compile(r'^water$', re.IGNORECASE)

COL_FOOD_ID  = 0
COL_DATETIME = 1
COL_MEAL     = 2
COL_NAME     = 3
COL_AMOUNT   = 4
COL_CALORIES = 5
COL_FAT      = 9
COL_CARBS    = 14
COL_PROTEIN  = 20


def parse_food_rows(food_file, from_date=None):
    """Return (foods, serving_sizes, log_entries) as lists of dicts."""
    foods = {}       # mnd_food_id -> dict
    log_entries = []

    with open(food_file, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        next(reader)

        for i, row in enumerate(reader, start=2):
            if len(row) < 21:
                continue

            mnd_food_id = row[COL_FOOD_ID].strip()
            raw_dt      = row[COL_DATETIME].strip()
            meal_raw    = row[COL_MEAL].strip()
            name        = row[COL_NAME].strip()

            if mnd_food_id == WATER_FOOD_ID or WATER_NAME_RE.match(name):
                continue

            try:
                log_date = parse_mnd_datetime(raw_dt)
            except ValueError as e:
                print(f"  [WARN] row {i}: {e} -- skipping")
                continue

            if from_date and log_date < from_date:
                continue

            calories  = parse_float(row[COL_CALORIES])
            fat_g     = parse_float(row[COL_FAT])
            carbs_g   = parse_float(row[COL_CARBS])
            protein_g = parse_float(row[COL_PROTEIN])
            meal      = meal_map(meal_raw)
            if mnd_food_id not in foods:
                foods[mnd_food_id] = dict(
                    name=name,
                    calories=calories, carbs=carbs_g,
                    protein=protein_g, fat=fat_g,
                )

            log_entries.append(dict(
                log_date=log_date, meal=meal, mnd_food_id=mnd_food_id,
                calories=calories, carbs_g=carbs_g,
                protein_g=protein_g, fat_g=fat_g,
            ))

    return foods, log_entries


def exec_food(food_file, user_id, from_date=None):
    import mysql.connector
    foods, log_entries = parse_food_rows(food_file, from_date)

    conn = mysql.connector.connect(**DB)
    cur  = conn.cursor()

    try:
        conn.start_transaction()

        # 1. Upsert foods — de-dup by (name, source='custom')
        for food in foods.values():
            cur.execute(
                "SELECT id FROM foods WHERE name = %s AND source = 'custom' LIMIT 1",
                (food['name'],)
            )
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO foods (name, source, is_custom, "
                    "calories_per100, carbs_per100, protein_per100, fat_per100) "
                    "VALUES (%s, 'custom', 1, %s, %s, %s, %s)",
                    (food['name'], food['calories'],
                     food['carbs'], food['protein'], food['fat'])
                )

        # 2. Upsert serving_sizes
        for food in foods.values():
            cur.execute(
                "SELECT id FROM foods WHERE name = %s AND source = 'custom' LIMIT 1",
                (food['name'],)
            )
            row = cur.fetchone()
            if row:
                food_id = row[0]
                cur.execute(
                    "INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) "
                    "VALUES (%s, '1 serving', 100, 1)",
                    (food_id,)
                )

        # 3. Insert food_log entries
        inserted = 0
        for entry in log_entries:
            food = foods[entry['mnd_food_id']]
            cur.execute(
                "SELECT id FROM foods WHERE name = %s AND source = 'custom' LIMIT 1",
                (food['name'],)
            )
            food_row = cur.fetchone()
            if not food_row:
                print(f"  [WARN] No food found for {entry['brand']} -- skipping log entry")
                continue
            food_id = food_row[0]

            cur.execute(
                "SELECT id FROM serving_sizes WHERE food_id = %s AND label = '1 serving' LIMIT 1",
                (food_id,)
            )
            ss_row = cur.fetchone()
            if not ss_row:
                print(f"  [WARN] No serving size for food {food_id} -- skipping log entry")
                continue
            ss_id = ss_row[0]

            cur.execute(
                "INSERT INTO food_log "
                "(user_id, log_date, meal, food_id, serving_size_id, quantity, "
                "calories, carbs_g, protein_g, fat_g) "
                "VALUES (%s, %s, %s, %s, %s, 1.0, %s, %s, %s, %s)",
                (user_id, entry['log_date'], entry['meal'], food_id, ss_id,
                 entry['calories'], entry['carbs_g'], entry['protein_g'], entry['fat_g'])
            )
            inserted += 1

        conn.commit()
        print(f"Food: inserted {inserted} log entries, {len(foods)} unique foods")

    except Exception as e:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def write_food_sql(food_file, user_id, out_path, from_date=None):
    foods, log_entries = parse_food_rows(food_file, from_date)

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write("-- MyNetDiary food import\n")
        f.write("-- mysql -u USER -p DBNAME < import_mnd_food.sql\n\n")
        f.write("START TRANSACTION;\n\n")

        f.write("-- 1. Upsert foods\n")
        for food in foods.values():
            f.write(
                f"INSERT INTO foods (name, source, is_custom, "
                f"calories_per100, carbs_per100, protein_per100, fat_per100) "
                f"SELECT {sql_str(food['name'])}, 'custom', 1, "
                f"{food['calories']}, {food['carbs']}, {food['protein']}, {food['fat']} "
                f"WHERE NOT EXISTS (SELECT 1 FROM foods WHERE name = {sql_str(food['name'])} AND source = 'custom');\n"
            )

        f.write("\n-- 2. Upsert serving_sizes\n")
        for food in foods.values():
            f.write(
                f"INSERT IGNORE INTO serving_sizes (food_id, label, grams, is_default) "
                f"SELECT id, '1 serving', 100, 1 FROM foods "
                f"WHERE name = {sql_str(food['name'])} AND source = 'custom' LIMIT 1;\n"
            )

        f.write("\n-- 3. Insert food_log\n")
        for entry in log_entries:
            food = foods[entry['mnd_food_id']]
            f.write(
                f"INSERT INTO food_log "
                f"(user_id, log_date, meal, food_id, serving_size_id, quantity, "
                f"calories, carbs_g, protein_g, fat_g) "
                f"SELECT {user_id}, {sql_str(entry['log_date'])}, {sql_str(entry['meal'])}, "
                f"f.id, ss.id, 1.0, {entry['calories']}, {entry['carbs_g']}, "
                f"{entry['protein_g']}, {entry['fat_g']} "
                f"FROM foods f "
                f"JOIN serving_sizes ss ON ss.food_id = f.id AND ss.label = '1 serving' "
                f"WHERE f.name = {sql_str(food['name'])} AND f.source = 'custom' LIMIT 1;\n"
            )

        f.write("\nCOMMIT;\n")

    print(f"Food: {len(log_entries)} log entries, {len(foods)} unique foods -> {out_path}")


# ---------------------------------------------------------------------------
# Water import
# ---------------------------------------------------------------------------

def parse_water_rows(water_file, from_date=None):
    rows = []
    with open(water_file, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader)
        oz_col = next((i for i, h in enumerate(header) if 'fl oz' in h.lower()), 2)

        for i, row in enumerate(reader, start=2):
            if len(row) <= oz_col:
                continue
            try:
                log_date = parse_mnd_date(row[0].strip())
            except ValueError as e:
                print(f"  [WARN] row {i}: {e} -- skipping")
                continue
            if from_date and log_date < from_date:
                continue
            amount_oz = parse_float(row[oz_col])
            if amount_oz > 0:
                rows.append(dict(log_date=log_date, amount_oz=amount_oz))
    return rows


def exec_water(water_file, user_id, from_date=None):
    import mysql.connector
    rows = parse_water_rows(water_file, from_date)

    conn = mysql.connector.connect(**DB)
    cur  = conn.cursor()
    try:
        conn.start_transaction()
        for row in rows:
            cur.execute(
                "INSERT INTO water_log (user_id, log_date, amount_oz) VALUES (%s, %s, %s)",
                (user_id, row['log_date'], row['amount_oz'])
            )
        conn.commit()
        print(f"Water: inserted {len(rows)} entries")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


def write_water_sql(water_file, user_id, out_path, from_date=None):
    rows = parse_water_rows(water_file, from_date)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write("-- MyNetDiary water import\n")
        f.write("-- mysql -u USER -p DBNAME < import_mnd_water.sql\n\n")
        f.write("START TRANSACTION;\n\n")
        for row in rows:
            f.write(
                f"INSERT INTO water_log (user_id, log_date, amount_oz) "
                f"VALUES ({user_id}, {sql_str(row['log_date'])}, {row['amount_oz']});\n"
            )
        f.write("\nCOMMIT;\n")
    print(f"Water: {len(rows)} entries -> {out_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Import MyNetDiary data into Pulse")
    parser.add_argument('--food-file',  help="Path to MyNetDiary_Year_2026-food.csv")
    parser.add_argument('--water-file', help="Path to MyNetDiary_Year_2026-water.csv")
    parser.add_argument('--user-id',    type=int, default=1, help="Pulse user ID (default: 1)")
    parser.add_argument('--food-out',   default='import_mnd_food.sql')
    parser.add_argument('--water-out',  default='import_mnd_water.sql')
    parser.add_argument('--from-date',  help="Only import entries on or after YYYY-MM-DD")
    parser.add_argument('--exec',       action='store_true', help="Write directly to DB instead of SQL file")
    args = parser.parse_args()

    if not args.food_file and not args.water_file:
        parser.error("Provide at least --food-file or --water-file")

    if args.food_file:
        if not Path(args.food_file).exists():
            parser.error(f"Food file not found: {args.food_file}")
        if args.exec:
            exec_food(args.food_file, args.user_id, from_date=args.from_date)
        else:
            write_food_sql(args.food_file, args.user_id, args.food_out, from_date=args.from_date)

    if args.water_file:
        if not Path(args.water_file).exists():
            parser.error(f"Water file not found: {args.water_file}")
        if args.exec:
            exec_water(args.water_file, args.user_id, from_date=args.from_date)
        else:
            write_water_sql(args.water_file, args.user_id, args.water_out, from_date=args.from_date)

    print("Done.")


if __name__ == '__main__':
    main()
