ALTER TABLE "Service"
DROP CONSTRAINT IF EXISTS "Service_commissionAmount_check",
ADD CONSTRAINT "Service_non_negative_amounts_check" CHECK (
    ("contractedAmount" IS NULL OR "contractedAmount" >= 0)
    AND ("customerPaidAmount" IS NULL OR "customerPaidAmount" >= 0)
    AND ("grossCommission" IS NULL OR "grossCommission" >= 0)
    AND ("deduction" IS NULL OR "deduction" >= 0)
    AND ("commissionPaidAmount" IS NULL OR "commissionPaidAmount" >= 0)
);
