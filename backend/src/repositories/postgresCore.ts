import { Pool } from "pg";

export type PostgresSettings = Readonly<{
  connectionString: string;
  ssl?: boolean;
  sourceEnvKey: "DATABASE_URL" | "NEON_DATABASE_URL";
}>;

function asBoolean(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function resolvePostgresSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresSettings | null {
  const dbUrl = env.DATABASE_URL;
  const neonDbUrl = env.NEON_DATABASE_URL;
  const connectionString =
    typeof dbUrl === "string" && dbUrl.trim() !== ""
      ? dbUrl.trim()
      : typeof neonDbUrl === "string" && neonDbUrl.trim() !== ""
        ? neonDbUrl.trim()
        : "";
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    return null;
  }
  return {
    connectionString,
    ssl: asBoolean(env.DATABASE_SSL),
    sourceEnvKey: typeof dbUrl === "string" && dbUrl.trim() !== "" ? "DATABASE_URL" : "NEON_DATABASE_URL"
  };
}

export function createPostgresPool(settings: PostgresSettings): Pool {
  return new Pool({
    connectionString: settings.connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: settings.ssl === true ? { rejectUnauthorized: false } : undefined
  });
}

export async function ensurePostgresSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      bio TEXT NOT NULL,
      stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      discreet_mode BOOLEAN NOT NULL DEFAULT false,
      travel_mode_json JSONB,
      main_photo_media_id TEXT,
      gallery_media_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      video_media_id TEXT,
      updated_at_ms BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_records (
      media_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      object_key TEXT NOT NULL,
      sha256 TEXT,
      created_at_ms BIGINT NOT NULL,
      uploaded_at_ms BIGINT
    )
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_media_records_user_id ON media_records(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_media_records_uploaded_at_ms ON media_records(uploaded_at_ms)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      phone_e164 TEXT,
      user_type TEXT NOT NULL,
      tier TEXT NOT NULL,
      age_verified BOOLEAN NOT NULL DEFAULT false,
      email_verified BOOLEAN NOT NULL DEFAULT false,
      verification_code_salt_b64 TEXT,
      verification_code_hash_b64 TEXT,
      verification_code_expires_at_ms BIGINT,
      password_salt_b64 TEXT NOT NULL,
      password_hash_b64 TEXT NOT NULL,
      created_at_ms BIGINT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_token TEXT PRIMARY KEY,
      user_type TEXT NOT NULL,
      tier TEXT NOT NULL,
      mode TEXT NOT NULL,
      user_id TEXT,
      age_verified BOOLEAN NOT NULL DEFAULT false,
      hybrid_opt_in BOOLEAN NOT NULL DEFAULT false,
      expires_at_ms BIGINT NOT NULL
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at_ms ON auth_sessions(expires_at_ms)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      message_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      chat_kind TEXT NOT NULL,
      from_key TEXT NOT NULL,
      to_key TEXT NOT NULL,
      text TEXT NOT NULL,
      media_json JSONB,
      created_at_ms BIGINT NOT NULL,
      delivered_at_ms BIGINT,
      read_at_ms BIGINT,
      expires_at_ms BIGINT
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at_ms ON chat_messages(created_at_ms)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_read_cursors (
      thread_user_key TEXT PRIMARY KEY,
      read_at_ms BIGINT NOT NULL
    )
  `);
}
