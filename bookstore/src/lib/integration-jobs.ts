import { Prisma } from "../generated/prisma/client";
import { prisma } from "./db";

type ClaimInput = {
  provider: string;
  kind: string;
  externalId: string;
  idempotencyKey: string;
  payload: Prisma.InputJsonValue;
};

export async function claimIntegrationJob(input: ClaimInput) {
  try {
    const job = await prisma.integrationJob.create({
      data: { ...input, status: "PROCESSING", attempts: 1 },
    });
    return { job, claimed: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await prisma.integrationJob.findUniqueOrThrow({
      where: { idempotencyKey: input.idempotencyKey },
    });
    const claimed = await prisma.integrationJob.updateMany({
      where: { id: existing.id, status: { in: ["FAILED", "PENDING"] } },
      data: { status: "PROCESSING", attempts: { increment: 1 }, error: null, completedAt: null },
    });
    return {
      job: claimed.count === 1
        ? await prisma.integrationJob.findUniqueOrThrow({ where: { id: existing.id } })
        : existing,
      claimed: claimed.count === 1,
    };
  }
}
