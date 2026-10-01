-- REVIEW AND BACK UP BEFORE AN OPERATOR RUNS THIS FILE. Never run automatically.
-- Additive migration: legacy contact links and all messages remain unchanged.
BEGIN;
CREATE TABLE customer_workspaces (
  contact_id TEXT PRIMARY KEY REFERENCES contacts(id) ON DELETE RESTRICT,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  segment TEXT NOT NULL DEFAULT 'retail' CHECK (segment IN ('retail','chain','wholesale')),
  potential TEXT NOT NULL DEFAULT 'unrated' CHECK (potential IN ('unrated','cold','warm','hot')),
  potential_notes TEXT,
  accountant_user_id TEXT REFERENCES users(id),
  care_status TEXT NOT NULL DEFAULT 'active' CHECK (care_status IN ('active','paused')),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX customer_workspaces_org_segment_potential_idx ON customer_workspaces(org_id,segment,potential);
CREATE TABLE contact_pos_links (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  pos_customer_id INTEGER NOT NULL CHECK (pos_customer_id > 0),
  created_by_id TEXT REFERENCES users(id),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id,pos_customer_id)
);
CREATE INDEX contact_pos_links_org_contact_idx ON contact_pos_links(org_id,contact_id);
CREATE TABLE customer_conversation_links (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE RESTRICT,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX customer_conversation_links_org_contact_idx ON customer_conversation_links(org_id,contact_id);
CREATE TABLE pos_write_operations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  operation_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_id,operation_key)
);
CREATE INDEX pos_write_operations_org_status_idx ON pos_write_operations(org_id,status);
CREATE TABLE pos_snapshots (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  resource TEXT NOT NULL,
  pos_id INTEGER NOT NULL,
  source_updated_at TIMESTAMP(3) NOT NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload JSONB NOT NULL,
  PRIMARY KEY(org_id,resource,pos_id)
);
ALTER TABLE conversations ADD COLUMN dissolved_at TIMESTAMP(3), ADD COLUMN dissolved_source TEXT;
ALTER TABLE tasks ADD COLUMN pos_customer_id INTEGER, ADD COLUMN conversation_id TEXT;
ALTER TABLE notes ADD COLUMN pos_customer_id INTEGER, ADD COLUMN conversation_id TEXT;
ALTER TABLE customer_product_interests
  ADD COLUMN pos_customer_id INTEGER,
  ADD COLUMN source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE customer_product_interests ALTER COLUMN origin SET DEFAULT 'manual';

-- Backfill ONLY unambiguous links. Conflicts remain untouched for operator review.
INSERT INTO contact_pos_links(id,org_id,contact_id,pos_customer_id)
SELECT 'legacy:' || c.id, c.org_id, c.id, c.pos_customer_id
FROM contacts c
WHERE c.pos_customer_id > 0 AND c.merged_into IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM contacts other WHERE other.org_id=c.org_id
      AND other.pos_customer_id=c.pos_customer_id AND other.id<>c.id
      AND other.merged_into IS NULL
  );

-- Match the existing RLS deployment mode; never silently weaken tenant isolation.
DO $$
DECLARE t TEXT;
BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid='contacts'::regclass) THEN
    FOREACH t IN ARRAY ARRAY['customer_workspaces','contact_pos_links','customer_conversation_links','pos_write_operations','pos_snapshots']
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (org_id=current_setting(''app.current_org'',true) OR current_setting(''app.bypass_rls'',true)=''on'') WITH CHECK (org_id=current_setting(''app.current_org'',true) OR current_setting(''app.bypass_rls'',true)=''on'')',t);
    END LOOP;
  END IF;
END $$;
COMMIT;

-- Conflict report: resolve manually; do not infer ownership from phones or names.
SELECT org_id,pos_customer_id,array_agg(id) AS conflicting_contact_ids
FROM contacts WHERE pos_customer_id IS NOT NULL AND merged_into IS NULL
GROUP BY org_id,pos_customer_id HAVING count(*)>1;
