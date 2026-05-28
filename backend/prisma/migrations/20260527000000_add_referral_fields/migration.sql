-- Add referral fields to User table
ALTER TABLE "User"
  ADD COLUMN "referralCode"        TEXT,
  ADD COLUMN "referredById"        TEXT,
  ADD COLUMN "referralBonusEarned" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Unique constraint on referralCode
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- Foreign key: referredById -> User.id (self-reference)
ALTER TABLE "User"
  ADD CONSTRAINT "User_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
