-- Paid-after-cancel fix (audit 2026-08-30 MONEY-001): gateway settlement
-- needs a real Order transition (CONFIRMED → PAID) so the reservation-expiry
-- job and manual cancel can no longer touch an order whose money was captured.
ALTER TYPE "OrderStatus" ADD VALUE 'PAID' AFTER 'CONFIRMED';
