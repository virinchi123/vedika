ALTER TABLE "Service"
ADD CONSTRAINT "Service_commissionAmount_check" CHECK (
    "commissionAmount" IS NULL
    OR (
        "contractedAmount" IS NOT NULL
        AND "commissionAmount" < "contractedAmount"
    )
);
