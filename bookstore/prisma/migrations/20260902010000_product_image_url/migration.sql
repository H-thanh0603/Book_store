-- Product cover images (Tiki thumbnails). Nullable: existing products keep no image.

ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
