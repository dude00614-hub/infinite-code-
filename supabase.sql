-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/viuphflhwwjsaplqcore/sql/new)

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(username, name)
);

CREATE TABLE IF NOT EXISTS db_entries (
  id BIGSERIAL PRIMARY KEY,
  command TEXT NOT NULL,
  description TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  added_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS themes (
  username TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'red',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edit_layouts (
  id INTEGER PRIMARY KEY DEFAULT 1,
  layout JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGSERIAL PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default edit layout row
INSERT INTO edit_layouts (id, layout) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;

-- RLS: allow all for anon key (personal tool)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all" ON users;
DROP POLICY IF EXISTS "Allow all" ON projects;
DROP POLICY IF EXISTS "Allow all" ON db_entries;
DROP POLICY IF EXISTS "Allow all" ON themes;
DROP POLICY IF EXISTS "Allow all" ON edit_layouts;
DROP POLICY IF EXISTS "Allow all" ON friend_requests;
DROP POLICY IF EXISTS "Allow all" ON chat_messages;
DROP POLICY IF EXISTS "Allow all" ON courses;

CREATE POLICY "Allow all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON db_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON themes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON edit_layouts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON friend_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON courses FOR ALL USING (true) WITH CHECK (true);
