// settings table access — editable NON-SECRET config (deploy hook URL etc.).
// Provider API keys never live here; they stay in env / GitHub secrets.
import { sql } from './db';

export async function getSetting(key: string): Promise<string> {
  const rows = (await sql()`SELECT value FROM settings WHERE key = ${key}`) as { value: string }[];
  return rows[0]?.value ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await sql()`INSERT INTO settings (key, value) VALUES (${key}, ${value})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}
