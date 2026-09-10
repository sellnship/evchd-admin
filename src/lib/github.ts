// GitHub REST helpers — Site Pages editing (contents API) and read-only fetches
// of the main site's local-facts.json/models.json (grounding data for the AI
// blog pipeline, see lib/blogPipeline.ts). Env: GITHUB_TOKEN (fine-grained
// PAT: this repo only, Contents read/write), GITHUB_REPO ("owner/name").
//
// Article generation no longer dispatches a GitHub Actions workflow (removed
// dispatchBlogWorkflow/actionsUrl -- see lib/blogPipeline.ts and
// admin/blog/ai.astro, which run the full pipeline in-process instead).
import { env } from './env';

const API = 'https://api.github.com';

function repo(): string {
  const r = env('GITHUB_REPO');
  if (!r) throw new Error('GITHUB_REPO is not set (expected "owner/name")');
  return r;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const token = env('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
}

/** List markdown files under a repo directory (one level; caller recurses). */
export async function listDir(path: string): Promise<{ name: string; path: string; type: string }[]> {
  const res = await gh(`/repos/${repo()}/contents/${path}?ref=main`);
  if (!res.ok) throw new Error(`GitHub list ${path}: HTTP ${res.status}`);
  return res.json();
}

/** Fetch one file's text + blob sha (sha must round-trip into the commit PUT). */
export async function getFile(path: string): Promise<{ content: string; sha: string }> {
  const res = await gh(`/repos/${repo()}/contents/${encodeURI(path)}?ref=main`);
  if (!res.ok) throw new Error(`GitHub get ${path}: HTTP ${res.status}`);
  const j = await res.json();
  return { content: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha };
}

/** Commit new file content to main. Base64 from a Buffer — never btoa — so
 *  Devanagari/UTF-8 content survives. */
export async function putFile(path: string, content: string, sha: string, message: string): Promise<void> {
  const res = await gh(`/repos/${repo()}/contents/${encodeURI(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      branch: 'main',
    }),
  });
  if (!res.ok) throw new Error(`GitHub commit ${path}: HTTP ${res.status} ${await res.text()}`);
}
