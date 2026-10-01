CREATE TABLE IF NOT EXISTS contact_pos_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pos_customer_id INTEGER NOT NULL,
  pos_customer_code TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS contact_pos_links_org_id_pos_customer_id_key
  ON contact_pos_links (org_id, pos_customer_id);

CREATE INDEX IF NOT EXISTS contact_pos_links_contact_id_idx
  ON contact_pos_links (contact_id);

INSERT INTO contact_pos_links (id, org_id, contact_id, pos_customer_id, pos_customer_code)
SELECT gen_random_uuid()::text, c.org_id, c.id, c.pos_customer_id, c.pos_customer_code
FROM contacts c
WHERE c.pos_customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM contacts other
    WHERE other.org_id = c.org_id
      AND other.pos_customer_id = c.pos_customer_id
      AND other.id <> c.id
  )
ON CONFLICT (org_id, pos_customer_id) DO NOTHING;
