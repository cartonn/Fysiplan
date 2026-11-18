// De verbinding met PostgreSQL voor lib/database.js. Alleen geladen als de database meeschrijft
// (DATABASE_URL en DATABASE_MEESCHRIJVEN=aan); zonder die twee laadt de server pg niet eens.
import pg from "pg";

export function maakPgDb(url, { max = 3 } = {}) {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000, statement_timeout: 60000 });
  // een verbinding die wegvalt terwijl ze in de pool ligt, mag het proces niet laten vallen
  pool.on("error", (e) => console.error("database: verbinding weggevallen:", e && e.message));
  return {
    query: (sql, params) => pool.query(sql, params),
    async transactie(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const uit = await fn((sql, params) => c.query(sql, params));
        await c.query("commit");
        return uit;
      } catch (e) {
        try { await c.query("rollback"); } catch {}
        throw e;
      } finally {
        c.release();
      }
    },
    sluit: () => pool.end()
  };
}
