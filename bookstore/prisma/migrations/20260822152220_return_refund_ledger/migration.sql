-- CreateTable
CREATE TABLE "ReturnPayment" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "amount" BIGINT NOT NULL,
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnPayment_returnId_idx" ON "ReturnPayment"("returnId");

-- AddForeignKey
ALTER TABLE "ReturnPayment" ADD CONSTRAINT "ReturnPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
