CREATE UNIQUE INDEX IF NOT EXISTS "Order_storefront_external_id_key"
ON "Order" ("externalId")
WHERE "externalId" LIKE 'storefront:%';
