import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

export async function connectWithRetry(
  prisma: PrismaClient,
  retries = 5,
  delay = 2000,
): Promise<void> {
  // retries<=0 would otherwise skip the loop body entirely and resolve
  // without ever calling $connect(); always make at least one attempt.
  const attempts = Math.max(retries, 1);
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      logger.warn(
        `DB not ready, retrying in ${delay * 2 ** i}ms (attempt ${i + 1}/${attempts})`,
      );
      await new Promise((r) => setTimeout(r, delay * 2 ** i));
    }
  }
}
