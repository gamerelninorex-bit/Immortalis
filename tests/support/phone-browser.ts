/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted browser reads untyped JSON */
// TEST SUPPORT: a scripted browser (cookie jar and request token), exactly as the phone pages' own script keeps them. Mechanism only.

/** a scripted browser: it keeps a cookie jar and the request token, exactly as the page's script does */
export class Browser {
  cookie = "";
  csrf = "";
  readonly base: string;
  readonly extra: Record<string, string>;
  constructor(base: string, extra: Record<string, string> = {}) {
    this.base = base;
    this.extra = extra;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { "x-immortalis-csrf": this.csrf } : {}),
        ...this.extra,
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0] ?? "";
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  }
  async login(role: "player" | "referee", token: string) {
    const r = await this.req("POST", "/api/login", { role, token });
    if (r.status === 200) this.csrf = r.json.csrf;
    return r;
  }
  /** long-polls until the lane shows a pending prompt (or the run is over) */
  async untilPrompt(lane: "play" | "ref", from = 0) {
    let after = from;
    const seen: any[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await this.req("GET", `/api/${lane}/poll?after=${after}`);
      seen.push(...(r.json?.lines ?? []));
      after = r.json?.seq ?? after;
      if (r.json?.pending || (r.json && r.json.running === false && seen.length > 0))
        return { snap: r.json, seen, after };
    }
    throw new Error("no prompt or end");
  }
}
