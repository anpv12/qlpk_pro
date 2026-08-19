-- Add stable stock identity for in-clinic prescription rows.
-- medicine_name remains a display snapshot only; stock/report logic must use medicine_id.

ALTER TABLE prescription_items
ADD COLUMN IF NOT EXISTS medicine_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_prescription_items_medicine_id
ON prescription_items (medicine_id);

DO $$
BEGIN
    ALTER TABLE prescription_items
    ADD CONSTRAINT fk_prescription_items_medicine_id
    FOREIGN KEY (medicine_id) REFERENCES medicines(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Safe legacy backfill: only when an appointment has exactly one in-clinic
-- prescription item without medicine_id and exactly one prescription stock export id.
WITH single_item_appointments AS (
    SELECT
        p.appointment_id,
        MIN(pi.id) AS prescription_item_id,
        COUNT(DISTINCT pi.id) AS item_count
    FROM prescription_items pi
    JOIN prescriptions p ON p.id = pi.prescription_id
    WHERE COALESCE(pi.is_external, FALSE) = FALSE
      AND pi.medicine_id IS NULL
    GROUP BY p.appointment_id
),
single_export_appointments AS (
    SELECT
        p.appointment_id,
        MIN(mt.medicine_id) AS medicine_id,
        COUNT(DISTINCT mt.medicine_id) AS medicine_count
    FROM prescriptions p
    JOIN medicine_transactions mt
      ON mt.note = 'Xuất theo đơn thuốc - Lịch hẹn ID: ' || p.appointment_id
    GROUP BY p.appointment_id
)
UPDATE prescription_items pi
SET medicine_id = sea.medicine_id
FROM single_item_appointments sia
JOIN single_export_appointments sea
  ON sea.appointment_id = sia.appointment_id
WHERE pi.id = sia.prescription_item_id
  AND sia.item_count = 1
  AND sea.medicine_count = 1;

-- Controlled legacy repair: old rows only had medicine_name. For old data only,
-- backfill by name when the trimmed stock name is unique in medicines. Ambiguous
-- names remain NULL and must be reselected from stock in the UI.
WITH unique_medicines AS (
    SELECT
        TRIM(name) AS normalized_name,
        MIN(id) AS medicine_id
    FROM medicines
    GROUP BY TRIM(name)
    HAVING COUNT(*) = 1
)
UPDATE prescription_items pi
SET medicine_id = um.medicine_id
FROM unique_medicines um
WHERE pi.medicine_id IS NULL
  AND COALESCE(pi.is_external, FALSE) = FALSE
  AND TRIM(pi.medicine_name) = um.normalized_name;

-- Manual accepted legacy mapping by clinic decision.
-- These rows are old in-clinic prescription snapshots without medicine_id.
-- Mapping is intentionally explicit by legacy display name and only applies while
-- medicine_id is still NULL. Sertralin without strength is intentionally left unmapped.
WITH manual_legacy_medicine_map(legacy_name, target_medicine_id) AS (
    VALUES
        ('Mirtazapine 30', 7485),
        ('Gabapentine 300mg (xách tay)', 7457),
        ('Sertralin 50', 7434),
        ('Olanzapin 5', 7443),
        ('Biginko', 7474),
        ('Ginkgo biloba', 7474),
        ('Olanzapin', 7443),
        ('Paroxetin', 7437),
        ('Divalproex', 7459),
        ('Donepezil', 7472),
        ('Donepezil 10mg (xách tay)', 7472),
        ('Eszopiclon', 7469),
        ('Lamostad 50', 7464),
        ('Mirzaten 30mg', 7485),
        ('Olanzapin 10', 7444),
        ('Risperidon', 7451),
        ('Venlafaxine 75mg (xách tay)', 7438)
)
UPDATE prescription_items pi
SET medicine_id = mlmm.target_medicine_id
FROM manual_legacy_medicine_map mlmm
JOIN medicines m ON m.id = mlmm.target_medicine_id
WHERE pi.medicine_id IS NULL
  AND COALESCE(pi.is_external, FALSE) = FALSE
  AND TRIM(pi.medicine_name) = mlmm.legacy_name;
