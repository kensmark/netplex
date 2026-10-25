export class LocalClient {
  constructor(origin) { this.origin = origin; }
  async ready() {
    const response = await fetch(`${this.origin}/api/status`);
    this.cookie = response.headers.get('set-cookie')?.split(';')[0];
    this.csrf = (await response.json()).csrf;
    if (!this.cookie || !this.csrf) throw new Error('NetPlex kunne ikke starte sin lokale session.');
    return this;
  }
  async request(path, body) {
    if (!/^\/api\//.test(path)) throw new Error('Ugyldig lokal forespørgsel.');
    const response = await fetch(this.origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: this.cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-NetPlex-CSRF': this.csrf }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Den lokale forbindelse blev afbrudt.');
    return result;
  }
}
