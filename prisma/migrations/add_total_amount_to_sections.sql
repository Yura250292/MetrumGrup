-- Додати поле totalAmount до таблиці estimate_sections
ALTER TABLE estimate_sections 
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) DEFAULT 0 NOT NULL;

-- Оновити існуючі секції - обчислити totalAmount з позицій
UPDATE estimate_sections es
SET total_amount = COALESCE((
  SELECT SUM(amount)
  FROM estimate_items ei
  WHERE ei.section_id = es.id
), 0);
