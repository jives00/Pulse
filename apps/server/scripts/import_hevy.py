#!/usr/bin/env python3
"""
Hevy workout CSV importer for Pulse.

Usage:
  python import_hevy.py <path/to/workouts.csv> [--user-id 1] [--limit 1] [--dry-run]

  --limit N   Only import the N most recent workouts (default: all)
  --dry-run   Print what would be inserted without touching the DB
"""

import csv
import sys
import os
import argparse
import math
from datetime import datetime, date
from collections import defaultdict, OrderedDict
import mysql.connector

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB = dict(host="127.0.0.1", port=3307, user="pulseuser",
          password="x!gMEqM3uCzaQ", database="pulse")

KG_TO_LBS = 2.20462
MILES_TO_METERS = 1609.34

# ---------------------------------------------------------------------------
# Exercise name mapping: Hevy name -> DB name
# ---------------------------------------------------------------------------

EXERCISE_MAP = {
    "Pull Up":                             "Pull-Up",
    "Push Up":                             "Push-Up",
    "Plank":                               "Plank",
    "Goblet Squat":                        "Goblet Squat",
    "Hanging Leg Raise":                   "Hanging Leg Raise",
    "Dead Bug":                            "Dead Bug",
    "Skullcrusher (Dumbbell)":             "Skull Crusher",
    "Romanian Deadlift (Dumbbell)":        "Romanian Deadlift",
    "Lateral Raise (Dumbbell)":            "Lateral Raise",
    "Bicep Curl (Dumbbell)":               "Dumbbell Curl",
    "Bent Over Row (Dumbbell)":            "Bent Over Row (Dumbbell)",
    "Walking Lunge":                       "Lunge",
    "Seated Overhead Press (Dumbbell)":    "Dumbbell Shoulder Press",
    "Stair Machine (Steps)":               "Stair Climber",
    # Already match DB exactly:
    "Floor Press (Dumbbell)":              "Floor Press (Dumbbell)",
    "Shrug (Dumbbell)":                    "Shrug (Dumbbell)",
    "Single Arm Tricep Extension (Dumbbell)": "Overhead Tricep Extension",
    "Dumbbell Row":                        "Dumbbell Row",
    "Hammer Curl (Dumbbell)":              "Hammer Curl",
}

# ---------------------------------------------------------------------------
# Workout title -> routine name mapping
# ---------------------------------------------------------------------------

ROUTINE_MAP = {
    "Workout A: Upper Body (chest, shoulders, triceps)": "Workout A: Upper Body",
    "Workout B: Upper Body (back, biceps, core)":        "Workout B: Upper Body",
    "Workout C: Lower Body & Posture":                   "Workout C: Lower Body and Posture",
    "Stairs":                                            "Stairs",
}

# ---------------------------------------------------------------------------
# Calorie estimation (mirrors calorieEstimation.ts logic)
# ---------------------------------------------------------------------------

MET_TABLE = {
    # category -> (exercise_type, MET)
    "cardio":      5.0,
    "weight":      3.5,
    "bodyweight":  4.0,
    "duration":    3.0,
}

CATEGORY_MET = {
    "Cardio":     8.0,
    "Full Body":  5.0,
    "Legs":       4.5,
    "Back":       4.0,
    "Chest":      4.0,
    "Shoulders":  3.5,
    "Arms":       3.0,
    "Core":       3.5,
}

def estimate_calories(exercises_with_sets, duration_minutes, body_weight_kg=75.0):
    """
    Rough MET-based estimate matching the server's calorieEstimation logic.
    exercises_with_sets: list of dicts with keys: exercise_type, category, sets (list of set dicts)
    """
    if not exercises_with_sets or duration_minutes <= 0:
        return None

    total_weighted_met = 0.0
    total_weight = 0.0

    for ex in exercises_with_sets:
        ex_type = (ex.get("exercise_type") or "weight").lower()
        category = ex.get("category") or ""
        sets = ex.get("sets") or []

        base_met = MET_TABLE.get(ex_type, 3.5)
        cat_met  = CATEGORY_MET.get(category, 3.5)
        met = (base_met + cat_met) / 2.0

        # Intensity boost for heavy sets
        for s in sets:
            weight_kg = s.get("weight_kg") or 0
            reps = s.get("reps") or 0
            if weight_kg > 80:
                met += 0.5
            elif weight_kg > 40:
                met += 0.25
            if reps >= 15:
                met += 0.2

        set_count = len(sets) or 1
        total_weighted_met += met * set_count
        total_weight += set_count

    avg_met = total_weighted_met / total_weight if total_weight > 0 else 3.5

    # Clamp
    avg_met = max(2.0, min(avg_met, 12.0))

    hours = duration_minutes / 60.0
    calories = avg_met * body_weight_kg * hours
    return round(calories)


# ---------------------------------------------------------------------------
# Parse date from Hevy format: "4 Apr 2026, 14:30"
# ---------------------------------------------------------------------------

def parse_hevy_dt(s):
    s = s.strip().strip('"')
    for fmt in ("%d %b %Y, %H:%M", "%b %d, %Y, %I:%M %p"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {s!r}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file")
    parser.add_argument("--user-id", type=int, default=1)
    parser.add_argument("--limit", type=int, default=None,
                        help="Only import the N most recent workouts")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # --- Load CSV ---
    rows = []
    with open(args.csv_file, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    # --- Group into workouts: keyed by (title, start_time) ---
    # Use OrderedDict to preserve CSV order (chronological)
    workout_groups = OrderedDict()
    for row in rows:
        key = (row["title"].strip(), row["start_time"].strip())
        if key not in workout_groups:
            workout_groups[key] = {"title": row["title"].strip(),
                                   "start_time": row["start_time"].strip(),
                                   "end_time": row["end_time"].strip(),
                                   "exercises": OrderedDict()}
        ex_title = row["exercise_title"].strip()
        if ex_title not in workout_groups[key]["exercises"]:
            workout_groups[key]["exercises"][ex_title] = []
        workout_groups[key]["exercises"][ex_title].append(row)

    workouts = list(workout_groups.values())

    # Apply --limit (most recent = last N)
    if args.limit:
        workouts = workouts[-args.limit:]

    print(f"Found {len(workout_groups)} total workouts in CSV.")
    print(f"Importing {len(workouts)} workout(s).")
    print()

    if args.dry_run:
        print("=== DRY RUN — no DB changes ===\n")
        for w in workouts:
            start_dt = parse_hevy_dt(w["start_time"])
            end_dt   = parse_hevy_dt(w["end_time"])
            duration = math.ceil((end_dt - start_dt).total_seconds() / 60)
            routine_name = ROUTINE_MAP.get(w["title"], None)
            print(f"Workout: {w['title']}")
            print(f"  Date: {start_dt.date()}  Duration: {duration} min")
            print(f"  Routine: {routine_name or '(no match)'}")
            for ex_hevy, sets in w["exercises"].items():
                db_name = EXERCISE_MAP.get(ex_hevy, f"[UNMAPPED] {ex_hevy}")
                print(f"  Exercise: {ex_hevy} -> {db_name}  ({len(sets)} sets)")
            print()
        return

    # --- Connect ---
    conn = mysql.connector.connect(**DB)
    cur = conn.cursor(dictionary=True)

    # --- Load exercise name -> id map ---
    cur.execute("SELECT id, name, exercise_type, category FROM exercises")
    db_exercises = {row["name"]: row for row in cur.fetchall()}

    # --- Load routine name -> id map ---
    cur.execute("SELECT id, name FROM workout_routines WHERE user_id = %s", (args.user_id,))
    db_routines = {row["name"]: row["id"] for row in cur.fetchall()}

    # --- Load user body weight (for calorie estimate) ---
    cur.execute("""
        SELECT value FROM body_measurements
        WHERE user_id = %s AND metric = 'weight' AND unit IN ('lb','lbs')
        ORDER BY measured_at DESC LIMIT 1
    """, (args.user_id,))
    row = cur.fetchone()
    if row:
        body_weight_kg = float(row["value"]) / KG_TO_LBS
        print(f"Using body weight: {row['value']:.1f} lb ({body_weight_kg:.1f} kg)")
    else:
        body_weight_kg = 75.0
        print("No body weight found — using default 75 kg for calorie estimates.")
    print()

    # --- Verify all mapped exercises exist ---
    for hevy_name, db_name in EXERCISE_MAP.items():
        if db_name not in db_exercises:
            print(f"WARNING: Exercise '{db_name}' (mapped from '{hevy_name}') not found in DB — sets will be skipped.")

    # --- Import workouts ---
    for w in workouts:
        start_dt = parse_hevy_dt(w["start_time"])
        end_dt   = parse_hevy_dt(w["end_time"])
        duration = math.ceil((end_dt - start_dt).total_seconds() / 60)
        workout_date = start_dt.date()
        routine_name = ROUTINE_MAP.get(w["title"], None)
        routine_id   = db_routines.get(routine_name) if routine_name else None

        print(f"Importing: {w['title']}  ({workout_date})")
        if routine_id:
            print(f"  -> Linked to routine: {routine_name} (id={routine_id})")
        else:
            print(f"  -> No routine match (outlier workout)")

        # Insert workout_logs
        cur.execute("""
            INSERT INTO workout_logs
                (user_id, workout_date, name, duration_minutes, completed, started_at, routine_id)
            VALUES (%s, %s, %s, %s, 1, %s, %s)
        """, (args.user_id, workout_date, w["title"], duration,
              start_dt.strftime("%Y-%m-%d %H:%M:%S"), routine_id))
        workout_log_id = cur.lastrowid

        # Insert exercises + sets; collect data for calorie estimate
        exercises_for_estimate = []
        sort_order = 0

        for ex_hevy, set_rows in w["exercises"].items():
            db_name = EXERCISE_MAP.get(ex_hevy, ex_hevy)
            ex_info = db_exercises.get(db_name)
            if not ex_info:
                print(f"  SKIP exercise (not in DB): {ex_hevy}")
                continue

            cur.execute("""
                INSERT INTO workout_exercises (workout_log_id, exercise_id, sort_order)
                VALUES (%s, %s, %s)
            """, (workout_log_id, ex_info["id"], sort_order))
            workout_exercise_id = cur.lastrowid
            sort_order += 1

            sets_for_estimate = []
            completed_sets = [r for r in set_rows if r.get("set_type", "").strip() != "warmup"]

            for row in set_rows:
                set_num    = int(row["set_index"]) + 1
                weight_lbs = float(row["weight_lbs"]) if row["weight_lbs"].strip() else 0.0
                reps       = int(row["reps"]) if row["reps"].strip() else None
                dist_miles = float(row["distance_miles"]) if row["distance_miles"].strip() else None
                dur_secs   = int(row["duration_seconds"]) if row["duration_seconds"].strip() else None

                weight_kg      = weight_lbs / KG_TO_LBS if weight_lbs else None
                dist_meters    = dist_miles * MILES_TO_METERS if dist_miles else None

                cur.execute("""
                    INSERT INTO exercise_sets
                        (workout_exercise_id, set_number, reps, weight_kg, duration_seconds, distance_meters)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (workout_exercise_id, set_num, reps, weight_kg, dur_secs, dist_meters))

                sets_for_estimate.append({"weight_kg": weight_kg or 0, "reps": reps or 0})

            exercises_for_estimate.append({
                "exercise_type": ex_info.get("exercise_type", "weight"),
                "category":      ex_info.get("category", ""),
                "sets":          sets_for_estimate,
            })

            print(f"  + {db_name} ({len(set_rows)} sets)")

        # Estimate calories
        calories = estimate_calories(exercises_for_estimate, duration, body_weight_kg)
        if calories:
            cur.execute("""
                UPDATE workout_logs SET calories_burned = %s WHERE id = %s
            """, (calories, workout_log_id))
            print(f"  Estimated calories burned: {calories} kcal")

        conn.commit()
        print(f"  Committed (workout_log id={workout_log_id})\n")

    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
