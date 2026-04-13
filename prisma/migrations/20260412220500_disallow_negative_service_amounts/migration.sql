ALTER TABLE "Service"
DROP CONSTRAINT "Service_commissionAmount_check",
ADD CONSTRAINT "Service_commissionAmount_check" CHECK (
    ("contractedAmount" IS NULL OR "contractedAmount" >= 0)
    AND ("commissionAmount" IS NULL OR "commissionAmount" >= 0)
    AND (
        "commissionAmount" IS NULL
        OR (
            "contractedAmount" IS NOT NULL
            AND "commissionAmount" < "contractedAmount"
        )
    )
);
