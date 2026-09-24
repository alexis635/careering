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
  `CREATE INDEX IF NOT EXISTS jobs_lane_idx ON jobs(lane_id)`,
  `CREATE INDEX IF NOT EXISTS job_emails_thread_idx ON job_emails(gmail_thread_id)`,
];

for (const s of statements) await sql(s);
console.log('Careering schema ready.');
