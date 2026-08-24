-- unaccent: strips Vietnamese diacritics so typo-tolerant search also works
-- when the user types "hoc" instead of "học" (fuzzy fallback normalizes both
-- sides before comparing trigrams). Same superuser caveat as pg_trgm above.
CREATE EXTENSION IF NOT EXISTS unaccent;
