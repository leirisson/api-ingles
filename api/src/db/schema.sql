-- =============================================================
-- Schema: Plataforma de Ensino de Inglês
-- PostgreSQL 16
-- =============================================================

CREATE TABLE IF NOT EXISTS teachers (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR      NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  phone          VARCHAR(20)  NOT NULL UNIQUE,
  level          VARCHAR(5)   NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  total_points   INTEGER      NOT NULL DEFAULT 0,
  current_streak INTEGER      NOT NULL DEFAULT 0,
  longest_streak INTEGER      NOT NULL DEFAULT 0,
  last_activity  TIMESTAMP WITH TIME ZONE,
  password_hash  VARCHAR      NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(200) NOT NULL,
  type          VARCHAR(20)  NOT NULL CHECK (type IN ('lesson','quiz','exercise')),
  level         VARCHAR(5)   NOT NULL CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  rule_number   INTEGER      NOT NULL CHECK (rule_number BETWEEN 1 AND 16),
  body          JSONB        NOT NULL DEFAULT '{}',
  points_reward INTEGER      NOT NULL DEFAULT 10,
  order_index   INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content_id   UUID        REFERENCES content(id) ON DELETE SET NULL,
  modality     VARCHAR(20) NOT NULL CHECK (modality IN ('conversation','writing','listening')),
  score        INTEGER     NOT NULL DEFAULT 0,
  correct      INTEGER     NOT NULL DEFAULT 0,
  wrong        INTEGER     NOT NULL DEFAULT 0,
  duration_min INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS streaks (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date           DATE    NOT NULL,
  points_earned  INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS points_log (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount     INTEGER      NOT NULL DEFAULT 0,
  reason     VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS progress (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content_id   UUID        NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'not_started'
                           CHECK (status IN ('not_started','in_progress','done')),
  best_score   INTEGER     NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (student_id, content_id)
);

CREATE TABLE IF NOT EXISTS rankings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL CHECK (type IN ('global','by_level')),
  level      VARCHAR(5),
  position   INTEGER     NOT NULL DEFAULT 0,
  points     INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NULL-safe unique index for rankings (level can be NULL for global), scoped per teacher
CREATE UNIQUE INDEX IF NOT EXISTS rankings_student_type_level_uq
  ON rankings (student_id, type, COALESCE(level, '__global__'), teacher_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_students_teacher_id  ON students(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_student_id  ON sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at  ON sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_streaks_student_date ON streaks(student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_points_log_student   ON points_log(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_teacher     ON rankings(teacher_id, type, points DESC);
CREATE INDEX IF NOT EXISTS idx_progress_student     ON progress(student_id);
CREATE INDEX IF NOT EXISTS idx_content_rule_level   ON content(rule_number, level);
