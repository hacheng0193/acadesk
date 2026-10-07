import { execFile as execFileCb, execFileSync } from "node:child_process";
import { promisify } from "node:util";

/**
 * Logs in to NTU COOL the way the browser does - COOL's SAML login, the NTU SSO
 * (ADFS) username/password form, then the SAMLResponse handed back to COOL - and
 * returns the resulting session `Cookie` header.
 *
 * The NTU account lives in the login keychain as a generic password, service
 * `alex-system-ntu` (NTU_KEYCHAIN_SERVICE to change it), account = 學號:
 *
 *   security add-generic-password -s alex-system-ntu -a <學號> -w
 *
 * It is read with the same `security` tool that made it, so macOS doesn't ask.
 * Plain HTTP only; nothing here touches COOL beyond logging in.
 */

const execFile = promisify(execFileCb);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export class CoolLoginError extends Error {
  /** The SSO turned the username/password down: retrying would only risk locking the account. */
  constructor(
    message: string,
    readonly badCredentials = false,
  ) {
    super(message);
  }
}

function keychainService(): string {
  return process.env.NTU_KEYCHAIN_SERVICE || "alex-system-ntu";
}

let itemCache: { at: number; found: boolean } | null = null;

/** Whether the keychain item exists; checked at most once a minute, it runs on page renders. */
export function keychainConfigured(): boolean {
  if (process.platform !== "darwin") return false;
  if (itemCache && Date.now() - itemCache.at < 60_000) return itemCache.found;
  let found = false;
  try {
    execFileSync("security", ["find-generic-password", "-s", keychainService()], { stdio: "ignore", timeout: 10_000 });
    found = true;
  } catch {
    // Exit status 44: no such item.
  }
  itemCache = { at: Date.now(), found };
  return found;
}

async function credentials(): Promise<{ user: string; pass: string }> {
  const service = keychainService();
  try {
    const { stdout: attrs } = await execFile("security", ["find-generic-password", "-s", service], { timeout: 10_000 });
    const { stdout: pass } = await execFile("security", ["find-generic-password", "-s", service, "-w"], { timeout: 10_000 });
    const user = attrs.match(/"acct"<blob>="([^"]*)"/)?.[1] ?? "";
    if (!user || !pass.trim()) throw new Error("帳號或密碼是空的");
    return { user, pass: pass.replace(/\n$/, "") };
  } catch (e) {
    throw new CoolLoginError(`讀不到鑰匙圈裡的 ${service}：${(e as Error).message.split("\n")[0]}`);
  }
}

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The page's first form: absolute action URL and every named input with its value. */
function parseForm(html: string, base: string): { action: string; fields: Record<string, string> } {
  const action = html.match(/<form[^>]*action="([^"]*)"/i)?.[1];
  const fields: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<input[^>]*>/gi)) {
    const name = tag.match(/name="([^"]*)"/i)?.[1];
    if (name) fields[decode(name)] = decode(tag.match(/value="([^"]*)"/i)?.[1] ?? "");
  }
  return { action: action ? new URL(decode(action), base).href : base, fields };
}

/** Cookies per host, kept only for the length of one login. */
class Browser {
  private jar = new Map<string, Map<string, string>>();

  cookies(url: string): string {
    return [...(this.jar.get(new URL(url).host) ?? [])]
      .filter(([, v]) => v)
      .map(([n, v]) => `${n}=${v}`)
      .join("; ");
  }

  /** Request and follow redirects by hand, so each hop sends and stores its own host's cookies. */
  async go(url: string, init: { method?: string; body?: URLSearchParams } = {}): Promise<{ url: string; html: string }> {
    for (let hop = 0; hop < 15; hop++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: init.method ?? "GET",
          body: init.body,
          redirect: "manual",
          headers: {
            "User-Agent": UA,
            Cookie: this.cookies(url),
            ...(init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (e) {
        throw new CoolLoginError(`連不上 ${new URL(url).host}：${(e as Error).message}`);
      }
      const host = new URL(url).host;
      if (!this.jar.has(host)) this.jar.set(host, new Map());
      for (const sc of res.headers.getSetCookie()) {
        const pair = sc.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) this.jar.get(host)!.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        url = new URL(loc, url).href;
        init = {};
        continue;
      }
      return { url, html: await res.text() };
    }
    throw new CoolLoginError("登入時轉址太多次");
  }
}

/** Log in with the keychain account; returns the COOL `Cookie` header. */
export async function coolLogin(base: string): Promise<string> {
  const { user, pass } = await credentials();
  const browser = new Browser();

  let page = await browser.go(`${base}/login/saml`);
  if (!/PasswordTextBox/.test(page.html)) throw new CoolLoginError("找不到學校的登入表單（登入頁可能改版了）");

  const login = parseForm(page.html, page.url);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(login.fields)) {
    if (/UsernameTextBox$/.test(k)) body.set(k, user);
    else if (/PasswordTextBox$/.test(k)) body.set(k, pass);
    else if (/SubmitButton$/.test(k) || !/Button/.test(k)) body.set(k, v);
  }
  page = await browser.go(login.action, { method: "POST", body });

  if (/PasswordTextBox/.test(page.html)) {
    const said = page.html.match(/<span[^>]*id="[^"]*Error[^"]*"[^>]*>([^<]+)</i)?.[1]?.trim();
    throw new CoolLoginError(`學校登入系統拒絕了鑰匙圈裡的帳號密碼${said ? `（${said}）` : ""}`, true);
  }
  if (!/SAMLResponse/.test(page.html)) {
    throw new CoolLoginError("登入後沒有回到 COOL（可能多了驗證步驟，或登入頁改版了）");
  }

  const saml = parseForm(page.html, page.url);
  await browser.go(saml.action, { method: "POST", body: new URLSearchParams(saml.fields) });

  const cookie = browser.cookies(base);
  if (!/_normandy_session=/.test(cookie)) throw new CoolLoginError("登入流程跑完了，但 COOL 沒有給登入 cookie");
  return cookie;
}
