// GitHub REST helpers — Site Pages editing (contents API) and dispatching the
// blog draft workflow. Env: GITHUB_TOKEN (fine-grained PAT: this repo only,
// Contents read/write + Actions read/write), GITHUB_REPO ("owner/name").
const API = 'https://api.github.com';

function repo(): string {
  const r = process.env.GITHUB_REPO;
  if (!r) throw new Error('GITHUB_REPO is not set (expected "owner/name")');
  return r;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
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

/** Fire the blog draft workflow (workflow_dispatch). Returns void — GitHub
 *  responds 204 with no run id; run status is tracked via the topics table. */
export async function dispatchBlogWorkflow(topicSlug: string): Promise<void> {
  const res = await gh(`/repos/${repo()}/actions/workflows/publish-blog.yml/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { topic_slug: topicSlug } }),
  });
  if (res.status !== 204) throw new Error(`workflow_dispatch failed: HTTP ${res.status} ${await res.text()}`);
}

export function actionsUrl(): string {
  return `https://github.com/${repo()}/actions/workflows/publish-blog.yml`;
}
