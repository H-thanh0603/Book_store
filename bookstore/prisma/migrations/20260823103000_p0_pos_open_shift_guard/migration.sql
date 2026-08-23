CREATE UNIQUE INDEX IF NOT EXISTS "PosShift_one_open_per_terminal"
ON "PosShift" ("terminalId")
WHERE status = 'OPEN';
