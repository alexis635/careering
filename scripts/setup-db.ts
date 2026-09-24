import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const statements = [
  `CREATE TABLE IF NOT EXISTS lanes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    target_date DATE,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#567C8D',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    lane_id INT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'application',
    company TEXT NOT NULL DEFAULT '',
    role_title TEXT NOT NULL DEFAULT '',
    source_link TEXT NOT NULL DEFAULT '',
    stage TEXT NOT NULL DEFAULT 'Saved',
    closed_outcome TEXT,
    salary_range TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    remote_type TEXT NOT NULL DEFAULT '',
    applied_date DATE,
    deadline DATE,
    interview_dates JSONB NOT NULL DEFAULT '[]',
    contact_person TEXT NOT NULL DEFAULT '',
    contact_notes TEXT NOT NULL DEFAULT '',
    posting_text TEXT NOT NULL DEFAULT '',
    match_notes TEXT NOT NULL DEFAULT '',
    resume_version_id INT,
    interview_prep TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS job_documents (
    id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    version INT NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS job_notes (
    id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS job_actions (
    id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT false,
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS job_contacts (
    id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS job_emails (
    id SERIAL PRIMARY KEY,
    job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    gmail_thread_id TEXT,
    gmail_message_id TEXT UNIQUE,
    direction TEXT NOT NULL,
    from_addr TEXT NOT NULL DEFAULT '',
    to_addr TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS library_items (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
  )`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS posting_parsed JSONB`,
  `ALTER TABLE job_contacts ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit TEXT`,
  `ALTER TABLE job_emails ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE lanes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  `ALTER TABLE lanes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE lanes ADD COLUMN IF NOT EXISTS start_date DATE`,
  `CREATE TABLE IF NOT EXISTS career_docs (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    issuer TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    expires_on DATE,
    file_name TEXT,
    mime TEXT,
    size INT,
    file_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS wins (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    happened_on DATE,
    employer TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    impact TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'project',
    proof_url TEXT NOT NULL DEFAULT '',
    bullet_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS career_cases (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'promotion',
    employer TEXT NOT NULL DEFAULT '',
    params JSONB NOT NULL DEFAULT '{}',
    body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    employer TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    start_date DATE,
    end_date DATE,
    approx BOOLEAN NOT NULL DEFAULT false,
    notes TEXT NOT NULL DEFAULT '',
    job_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS comp_entries (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    effective_on DATE,
    kind TEXT NOT NULL DEFAULT 'raise',
    amount NUMERIC(12,2),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `ALTER TABLE job_notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE job_documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE job_actions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE job_contacts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE library_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `ALTER TABLE career_docs ADD COLUMN IF NOT EXISTS win_id INT`,
  `ALTER TABLE lanes ADD COLUMN IF NOT EXISTS stages_config JSONB`,
  `CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    responsibilities TEXT NOT NULL DEFAULT '',
    wrapup JSONB NOT NULL DEFAULT '{}',
    wrapped_up_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS ws_items (
    id SERIAL PRIMARY KEY,
    workspace_id INT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'task',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    due_on DATE,
    done_at TIMESTAMPTZ,
    extra JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general'`,
  `CREATE TABLE IF NOT EXISTS decks (
    id SERIAL PRIMARY KEY,
    job_id INT REFERENCES jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    angle TEXT NOT NULL DEFAULT '',
    minutes INT NOT NULL DEFAULT 10,
    spec JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS jobs_lane_idx ON jobs(lane_id)`,
  `CREATE INDEX IF NOT EXISTS job_emails_thread_idx ON job_emails(gmail_thread_id)`,
];

for (const s of statements) await sql(s);
console.log('Careering schema ready.');
