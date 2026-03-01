import type { Pool } from "pg";

import type { AuthStateSnapshot, Session, StoredUser } from "../services/authService";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}

function asUserType(value: unknown): StoredUser["userType"] {
  return value === "subscriber" ? "subscriber" : "registered";
}

function asTier(value: unknown): StoredUser["tier"] {
  return value === "premium" ? "premium" : "free";
}

function asMode(value: unknown): Session["mode"] {
  if (value === "date" || value === "hybrid") return value;
  return "cruise";
}

function asSessionUserType(value: unknown): Session["userType"] {
  if (value === "registered" || value === "subscriber") return value;
  return "guest";
}

function parseStoredUser(row: Record<string, unknown>): StoredUser | null {
  const id = asString(row.id);
  const email = asString(row.email);
  const passwordSaltB64 = asString(row.password_salt_b64);
  const passwordHashB64 = asString(row.password_hash_b64);
  const createdAtMs = asNumber(row.created_at_ms);
  if (!id || !email || !passwordSaltB64 || !passwordHashB64 || !Number.isFinite(createdAtMs)) {
    return null;
  }
  return {
    id,
    email,
    phoneE164: asNullableString(row.phone_e164),
    userType: asUserType(row.user_type),
    tier: asTier(row.tier),
    ageVerified: asBoolean(row.age_verified),
    emailVerified: asBoolean(row.email_verified),
    verificationCodeSaltB64: asNullableString(row.verification_code_salt_b64),
    verificationCodeHashB64: asNullableString(row.verification_code_hash_b64),
    verificationCodeExpiresAtMs: (() => {
      const n = row.verification_code_expires_at_ms;
      if (n === null || n === undefined) return null;
      const v = asNumber(n);
      return Number.isFinite(v) ? v : null;
    })(),
    passwordSaltB64,
    passwordHashB64,
    createdAtMs
  };
}

function parseSession(row: Record<string, unknown>): Session | null {
  const sessionToken = asString(row.session_token);
  const expiresAtMs = asNumber(row.expires_at_ms);
  if (!sessionToken || !Number.isFinite(expiresAtMs)) {
    return null;
  }
  const userIdRaw = row.user_id;
  return {
    sessionToken,
    userType: asSessionUserType(row.user_type),
    tier: asTier(row.tier),
    mode: asMode(row.mode),
    userId: typeof userIdRaw === "string" && userIdRaw.trim() !== "" ? userIdRaw : undefined,
    ageVerified: asBoolean(row.age_verified),
    hybridOptIn: asBoolean(row.hybrid_opt_in),
    expiresAtMs
  };
}

export type AuthStateRepository = Readonly<{
  loadState(): Promise<AuthStateSnapshot>;
  saveState(state: AuthStateSnapshot): Promise<void>;
}>;

export function createPostgresAuthStateRepository(pool: Pool): AuthStateRepository {
  return {
    async loadState(): Promise<AuthStateSnapshot> {
      const [usersRes, sessionsRes] = await Promise.all([
        pool.query(
          `SELECT id, email, phone_e164, user_type, tier, age_verified, email_verified,
                  verification_code_salt_b64, verification_code_hash_b64, verification_code_expires_at_ms,
                  password_salt_b64, password_hash_b64, created_at_ms
           FROM auth_users`
        ),
        pool.query(
          `SELECT session_token, user_type, tier, mode, user_id, age_verified, hybrid_opt_in, expires_at_ms
           FROM auth_sessions`
        )
      ]);

      const users: StoredUser[] = [];
      for (const row of usersRes.rows) {
        const parsed = parseStoredUser(row as Record<string, unknown>);
        if (parsed) users.push(parsed);
      }

      const sessions: Session[] = [];
      for (const row of sessionsRes.rows) {
        const parsed = parseSession(row as Record<string, unknown>);
        if (parsed) sessions.push(parsed);
      }

      return { users, sessions };
    },

    async saveState(state: AuthStateSnapshot): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM auth_users");
        await client.query("DELETE FROM auth_sessions");

        for (const user of state.users) {
          await client.query(
            `INSERT INTO auth_users (
              id, email, phone_e164, user_type, tier, age_verified, email_verified,
              verification_code_salt_b64, verification_code_hash_b64, verification_code_expires_at_ms,
              password_salt_b64, password_hash_b64, created_at_ms
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10,
              $11, $12, $13
            )`,
            [
              user.id,
              user.email,
              user.phoneE164,
              user.userType,
              user.tier,
              user.ageVerified,
              user.emailVerified,
              user.verificationCodeSaltB64,
              user.verificationCodeHashB64,
              user.verificationCodeExpiresAtMs,
              user.passwordSaltB64,
              user.passwordHashB64,
              user.createdAtMs
            ]
          );
        }

        for (const session of state.sessions) {
          await client.query(
            `INSERT INTO auth_sessions (
              session_token, user_type, tier, mode, user_id, age_verified, hybrid_opt_in, expires_at_ms
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8
            )`,
            [
              session.sessionToken,
              session.userType,
              session.tier,
              session.mode,
              session.userId ?? null,
              session.ageVerified,
              session.hybridOptIn,
              session.expiresAtMs
            ]
          );
        }

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
  };
}
