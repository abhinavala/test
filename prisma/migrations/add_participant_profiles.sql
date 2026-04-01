-- Migration: add_participant_profiles
-- Creates the participant profile data model including roles,
-- communication preferences, and meeting interaction history.

-- Enums

CREATE TYPE role_type AS ENUM (
  'ADMIN',
  'MANAGER',
  'ENGINEER',
  'DESIGNER',
  'PRODUCT',
  'SALES',
  'MARKETING',
  'SUPPORT',
  'GUEST',
  'OTHER'
);

CREATE TYPE email_frequency AS ENUM (
  'IMMEDIATE',
  'DAILY',
  'WEEKLY',
  'NEVER'
);

CREATE TYPE notification_type AS ENUM (
  'MEETING_INVITE',
  'MEETING_REMINDER',
  'MEETING_SUMMARY',
  'ACTION_ITEM',
  'MENTION'
);

-- Core participant table

CREATE TABLE participants (
  id               TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  email            TEXT        NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  is_guest         BOOLEAN     NOT NULL DEFAULT FALSE,
  privacy_settings JSONB       NOT NULL DEFAULT '{"limitDataVisibility":false,"allowHistoryAccess":true,"shareContactInfo":true}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT participants_pkey       PRIMARY KEY (id),
  CONSTRAINT participants_email_key  UNIQUE (email)
);

-- Partial index for efficient non-guest lookups
CREATE INDEX CONCURRENTLY idx_participants_non_guest
  ON participants (created_at DESC)
  WHERE is_guest = FALSE;

-- GIN index for JSONB privacy settings queries
CREATE INDEX CONCURRENTLY idx_participants_privacy
  ON participants USING gin (privacy_settings);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER participants_updated_at
  BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Participant roles (supports multiple, temporal assignments)

CREATE TABLE participant_roles (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  participant_id TEXT        NOT NULL,
  role_type      role_type   NOT NULL,
  department     TEXT,
  start_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date       TIMESTAMPTZ,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,

  CONSTRAINT participant_roles_pkey            PRIMARY KEY (id),
  CONSTRAINT participant_roles_participant_fk  FOREIGN KEY (participant_id)
      REFERENCES participants (id) ON DELETE CASCADE,
  CONSTRAINT participant_roles_unique_start    UNIQUE (participant_id, role_type, start_date)
);

-- Composite index for active role lookups (covering index)
CREATE INDEX CONCURRENTLY idx_participant_roles_active
  ON participant_roles (participant_id, is_active, role_type)
  INCLUDE (department, start_date);

-- Partial index scoped to active roles only
CREATE INDEX CONCURRENTLY idx_participant_roles_active_only
  ON participant_roles (participant_id, role_type)
  WHERE is_active = TRUE;

-- Communication preferences (one-to-one with participant)

CREATE TABLE communication_preferences (
  id                 TEXT             NOT NULL DEFAULT gen_random_uuid()::TEXT,
  participant_id     TEXT             NOT NULL,
  email_frequency    email_frequency  NOT NULL DEFAULT 'DAILY',
  notification_types notification_type[] NOT NULL DEFAULT ARRAY['MEETING_INVITE']::notification_type[],
  settings           JSONB            NOT NULL DEFAULT '{}'::JSONB,
  created_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT communication_preferences_pkey           PRIMARY KEY (id),
  CONSTRAINT communication_preferences_participant_uk UNIQUE (participant_id),
  CONSTRAINT communication_preferences_participant_fk FOREIGN KEY (participant_id)
      REFERENCES participants (id) ON DELETE CASCADE
);

-- GIN index for JSONB settings queries
CREATE INDEX CONCURRENTLY idx_preferences_settings
  ON communication_preferences USING gin (settings);

CREATE TRIGGER communication_preferences_updated_at
  BEFORE UPDATE ON communication_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Meeting interaction history

CREATE TABLE meeting_interactions (
  id               TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  participant_id   TEXT        NOT NULL,
  meeting_id       TEXT        NOT NULL,
  joined_at        TIMESTAMPTZ NOT NULL,
  left_at          TIMESTAMPTZ,
  duration_minutes INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT meeting_interactions_pkey           PRIMARY KEY (id),
  CONSTRAINT meeting_interactions_participant_fk FOREIGN KEY (participant_id)
      REFERENCES participants (id) ON DELETE CASCADE
);

-- Index for chronological history lookup per participant
CREATE INDEX CONCURRENTLY idx_meeting_interactions_participant
  ON meeting_interactions (participant_id, joined_at DESC);

-- Index for looking up interactions by meeting
CREATE INDEX CONCURRENTLY idx_meeting_interactions_meeting
  ON meeting_interactions (meeting_id, joined_at DESC);
