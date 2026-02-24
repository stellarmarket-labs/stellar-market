-- CreateEnum for EscrowStatus if not exists
DO $$ BEGIN
 CREATE TYPE "EscrowStatus" AS ENUM ('UNFUNDED', 'FUNDED', 'COMPLETED', 'CANCELLED', 'DISPUTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AlterTable User - Add missing columns
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable Job - Add missing columns
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "contractJobId" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'UNFUNDED';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);

-- Update existing jobs to have a deadline (30 days from creation)
UPDATE "Job" SET "deadline" = "createdAt" + INTERVAL '30 days' WHERE "deadline" IS NULL;

-- Make deadline NOT NULL after setting values
ALTER TABLE "Job" ALTER COLUMN "deadline" SET NOT NULL;

-- CreateIndex for contractJobId
CREATE UNIQUE INDEX IF NOT EXISTS "Job_contractJobId_key" ON "Job"("contractJobId");

-- AlterTable Milestone - Add missing columns
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "onChainIndex" INTEGER;
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "contractDeadline" TIMESTAMP(3);
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

-- AlterTable Application - Rename and add columns
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='Application' AND column_name='coverLetter') THEN
    ALTER TABLE "Application" RENAME COLUMN "coverLetter" TO "proposal";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='Application' AND column_name='proposedBudget') THEN
    ALTER TABLE "Application" RENAME COLUMN "proposedBudget" TO "bidAmount";
  END IF;
END $$;

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "estimatedDuration" TEXT;

-- Set default values for existing records
UPDATE "Application" SET "estimatedDuration" = '1 month' WHERE "estimatedDuration" IS NULL;

-- Make estimatedDuration NOT NULL
ALTER TABLE "Application" ALTER COLUMN "estimatedDuration" SET NOT NULL;
