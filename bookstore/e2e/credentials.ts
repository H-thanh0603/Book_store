// Shared, deterministic credentials for the staff-login e2e specs.
// e2e/global-setup.ts provisions a dedicated user with this password —
// intentionally NOT a seeded account, so specs never depend on the local
// seed state (prisma/seed.ts is deliberately create-only for passwords).
export const E2E_STAFF_EMAIL = "e2e-owner@bookstore.test";
export const E2E_STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "e2e-password-123456";
