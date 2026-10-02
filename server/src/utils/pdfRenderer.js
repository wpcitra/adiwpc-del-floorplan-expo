import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Invoice PDF (AGENTS.md §34): headless Chromium opens the app's own print route (/print/invoice/:id), which renders
// the SAME React component as the on-screen preview with the full stylesheet, then page.pdf() (A4, backgrounds).
// The invoice and the design are injected into the page before it loads: the print route needs no login, no public
// invoice endpoint and no token of its own.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../../client/dist');

const CANDIDATES = () => [
  process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROMIUM_PATH,
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];

/** Path of the Chromium / Chrome binary on this machine, or null (then the PDF endpoints answer 503). */
export function chromiumPath() {
  if (process.env.PDF_ENGINE === 'off') return null;
  return CANDIDATES().find(p => p && fs.existsSync(p)) || null;
}

export const pdfEngineAvailable = () => Boolean(chromiumPath());

export class PdfEngineError extends Error {
  constructor(message, code = 'PDF_ENGINE_UNAVAILABLE') { super(message); this.code = code; }
}

let browserPromise = null;
let idleTimer = null;
const IDLE_MS = 5 * 60 * 1000;

// The Chromium child never outlives the server: it is killed when the server is stopped or exits
let liveBrowser = null;
let exitHandlersInstalled = false;
const killBrowser = () => { try { liveBrowser?.process()?.kill('SIGKILL'); } catch (e) { /* already gone */ } };
function installExitHandlers() {
  if (exitHandlersInstalled) return;
  exitHandlersInstalled = true;
  process.once('exit', killBrowser);
  [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]].forEach(([signal, code]) => {
    // only when nothing else handles the signal (then that handler decides how the server stops)
    if (process.listenerCount(signal) === 0) process.once(signal, () => { killBrowser(); process.exit(code); });
  });
}

async function getBrowser() {
  const executablePath = chromiumPath();
  if (!executablePath) throw new PdfEngineError('Chromium tidak tersedia di server ini.');
  if (!browserPromise) {
    browserPromise = import('puppeteer-core')
      .then(({ default: puppeteer }) => puppeteer.launch({
        executablePath, headless: true,
        // Puppeteer's own signal handlers close the browser but keep this process alive: the server would no longer
        // stop on SIGTERM (deploy, restart). The handlers below end both.
        handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
        // containers (Railway, Docker, VPS as root) have no user namespace sandbox and a small /dev/shm
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none']
      }))
      .then(browser => {
        browser.on('disconnected', () => { browserPromise = null; });
        liveBrowser = browser;
        installExitHandlers();
        return browser;
      })
      .catch(err => { browserPromise = null; throw new PdfEngineError(`Chromium gagal dijalankan: ${err.message}`); });
  }
  // an idle browser is closed after a few minutes (memory); the next PDF starts it again
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => closePdfBrowser(), IDLE_MS);
  idleTimer.unref?.();
  return browserPromise;
}

export async function closePdfBrowser() {
  clearTimeout(idleTimer);
  const pending = browserPromise;
  browserPromise = null;
  try { (await pending)?.close(); } catch (e) { /* already gone */ }
}

/**
 * Where the print route is served: the page that asked (a local dev server on another port), otherwise this server
 * itself (production: the built client is served by the API). PRINT_BASE_URL overrides both.
 */
export function printBaseUrl(req, port) {
  if (process.env.PRINT_BASE_URL) return process.env.PRINT_BASE_URL.replace(/\/+$/, '');
  const from = String(req?.headers?.origin || req?.headers?.referer || '');
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.exec(from);
  if (local && !fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) return local[0];
  if (local && local[2] && local[2] !== `:${port}`) return local[0];
  return `http://127.0.0.1:${port}`;
}

// One PDF at a time: a queue keeps the memory use of the single browser predictable
let queue = Promise.resolve();

/**
 * Render { invoice, config } to an A4 PDF Buffer. `invoice` is the row every page shows (INVOICE_ROW_SQL +
 * invoiceRowMapper); `config` the invoice design (Desain Layout Invoice).
 */
export function renderInvoicePdf({ invoice, config, baseUrl }) {
  const job = queue.then(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      // (as script text: this file is linted as server code, `window` exists only inside the page)
      await page.evaluateOnNewDocument(`window.__INVOICE_PRINT__ = ${JSON.stringify({ invoice, config }).replace(/</g, '\\u003c')};`);
      const id = encodeURIComponent(String(invoice?.id || 'preview'));
      await page.goto(`${baseUrl}/print/invoice/${id}`, { waitUntil: 'networkidle0', timeout: 30000 });
      // the print page marks the sheet once the stylesheet, the fonts and every image (logo, signature) are in
      await page.waitForSelector('[data-print-ready="1"]', { timeout: 20000 });
      await page.evaluate('document.fonts.ready.then(() => true)');
      return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } }));
    } catch (err) {
      if (err instanceof PdfEngineError) throw err;
      throw new PdfEngineError(`PDF gagal dibuat: ${err.message}`, 'PDF_RENDER_FAILED');
    } finally {
      await page.close().catch(() => {});
    }
  });
  queue = job.catch(() => {});
  return job;
}

// ---- Download link for a registrant who is not logged in (the "Selesai" step of the public registration) ----
// A signed, short-lived token for ONE invoice; there is still no public invoice link (AGENTS.md §12, §20).
const TOKEN_SECRET = process.env.PDF_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const sign = (invoiceId, expires) => crypto.createHmac('sha256', TOKEN_SECRET).update(`${invoiceId}:${expires}`).digest('hex');

export function pdfTokenFor(invoiceId) {
  const expires = Date.now() + TOKEN_TTL_MS;
  return `${expires}.${sign(String(invoiceId), expires)}`;
}

export function pdfTokenValid(invoiceId, token) {
  const [expires, signature] = String(token || '').split('.');
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(String(invoiceId), Number(expires));
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
