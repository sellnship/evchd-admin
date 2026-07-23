// Env access that works in BOTH runtimes:
//   - local dev: .env is loaded by Vite → import.meta.env (not process.env)
//   - Vercel:    project env vars are real process env vars
export function env(name: string): string {
  const meta = (import.meta as any).env?.[name];
  if (typeof meta === 'string' && meta !== '') return meta;
  return process.env[name] ?? '';
}
