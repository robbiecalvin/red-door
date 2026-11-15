import type { Pool } from "pg";
import type { AnalyticsState } from "../services/analyticsService";
export function analyticsRepository(pool: Pool) {
  return {
    async load(): Promise<AnalyticsState | undefined> {
      await pool.query("CREATE TABLE IF NOT EXISTS product_analytics (id INTEGER PRIMARY KEY CHECK (id = 1), state_json JSONB NOT NULL)");
      const result = await pool.query("SELECT state_json FROM product_analytics WHERE id = 1");
      return result.rows[0]?.state_json;
    },
    async save(state: AnalyticsState) {
      await pool.query("INSERT INTO product_analytics (id, state_json) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET state_json = EXCLUDED.state_json", [JSON.stringify(state)]);
    }
  };
}
