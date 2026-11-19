CREATE TABLE category_prices (
  id TEXT PRIMARY KEY,
  price DOUBLE PRECISION CHECK (price IS NULL OR (price >= 0 AND price <= 10000000))
);
CREATE TABLE product_overrides (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (jsonb_typeof(data::jsonb) = 'object'),
  created_seq BIGSERIAL NOT NULL UNIQUE
);
CREATE TABLE admin_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL
);
CREATE TABLE admin_credentials (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  credential_version TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX admin_sessions_expires_at_index ON admin_sessions (expires_at);
CREATE TABLE admin_login_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start BIGINT NOT NULL
);
CREATE TABLE collection_definitions (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL,
  data TEXT NOT NULL CHECK (jsonb_typeof(data::jsonb) = 'object'),
  created_seq BIGSERIAL NOT NULL UNIQUE
);
CREATE UNIQUE INDEX collection_definitions_name_key_unique ON collection_definitions (name_key);
CREATE TABLE category_definitions (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  name_key TEXT NOT NULL,
  data TEXT NOT NULL CHECK (jsonb_typeof(data::jsonb) = 'object'),
  created_seq BIGSERIAL NOT NULL UNIQUE
);
CREATE UNIQUE INDEX category_definitions_parent_name_unique ON category_definitions (collection_id, name_key);
