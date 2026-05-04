import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});
export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      avatar TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  console.log("✅ Database tables initialized");
}
export async function findOrCreateUser(profile) {
  const { id: googleId, displayName, emails, photos } = profile;
  const email = emails?.[0]?.value ?? null;
  const avatar = photos?.[0]?.value ?? null;

  const existing = await pool.query(
    "SELECT * FROM users WHERE google_id = $1",
    [googleId]
  );

  if (existing.rows.length > 0) return existing.rows[0];

  const result = await pool.query(
    `INSERT INTO users (google_id, display_name, email, avatar)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [googleId, displayName, email, avatar]
  );

  return result.rows[0];
}

export async function getUserById(id) {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}
