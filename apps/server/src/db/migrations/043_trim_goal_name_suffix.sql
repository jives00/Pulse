-- Migration 043: Drop the trailing " Goal" from goal names.
--
-- Both add-goal forms defaulted the name to `catalogLabel + ' Goal'`, so goals created
-- without a typed-in name read "Weight Goal", "Waist Goal", "Bicep Goal" — while any
-- goal the user named by hand didn't, leaving the list inconsistent. The word carries
-- nothing: these only ever appear under a "Goals" heading or on a goal card.
--
-- Both forms now default to the bare catalog label, so this is a one-time cleanup of
-- rows created before that fix.
--
-- Scoped to a trailing " Goal" only: a goal legitimately named "Goal Weight" or
-- "Deadlift Goal Weight" keeps its name. Names that would be left empty (a goal
-- literally named "Goal") are skipped rather than blanked — titleFor() falls back to
-- the catalog label for an empty name, but storing one hides it from the edit path.

UPDATE goals
SET    name = TRIM(SUBSTRING(name, 1, CHAR_LENGTH(name) - 5))
WHERE  name LIKE '% Goal'
  AND  TRIM(SUBSTRING(name, 1, CHAR_LENGTH(name) - 5)) <> '';
