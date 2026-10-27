ALTER TABLE "Batch" ADD CONSTRAINT "Batch_remaining_nonnegative" CHECK (remaining >= 0);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_original_positive" CHECK (original > 0);
ALTER TABLE "Member" ADD CONSTRAINT "Member_valid_role" CHECK (role IN ('admin','member'));
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_valid_status" CHECK (status IN ('active','cancelled'));
