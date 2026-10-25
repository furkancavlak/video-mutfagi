// Language model calls for the radar. Two routes:
//   claude-cli  `claude -p` with the user's Claude subscription (default when the CLI is installed)
//   api         Anthropic API with ANTHROPIC_API_KEY (pay as you go; needs `npm i @anthropic-ai/sdk`)
//
// The CLI runs isolated from the user's own Claude Code setup: an empty temp working dir that holds a
// `.beyin-yok` marker, BEYIN_V3_SKIP=1, `--setting-sources project,local` (skips ~/.claude/settings.json hooks
// and plugins) and `--strict-mcp-config` (no MCP servers). Without this, personal hooks wrap every call and
// the radar's prompts end up in the user's notes.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');
const O = require('./ortak');

class LlmHatasi extends Error { constructor(m) { super(m); this.name = 'LlmHatasi'; } }

// ---- find the claude executable without a shell (paths with spaces / Turkish letters stay intact)
let claudeYolu;
function claudeBul() {
  if (claudeYolu !== undefined) return claudeYolu;
  const adaylar = [process.env.CLAUDE_BIN];
  if (process.platform === 'win32') {
    adaylar.push(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
    adaylar.push(path.join(os.homedir(), '.local', 'bin', 'claude.exe'));
    const w = spawnSync('where', ['claude'], { encoding: 'utf8' });
    if (w.status === 0) adaylar.push(...w.stdout.split(/\r?\n/).filter(l => /\.exe$/i.test(l.trim())).map(l => l.trim()));
  } else {
    adaylar.push(path.join(os.homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude');
    const w = spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
    if (w.status === 0) adaylar.push(w.stdout.trim());
  }
  claudeYolu = adaylar.find(a => a && fs.existsSync(a)) || null;
  return claudeYolu;
}

function yolSec(ayar = {}) {
  const yol = process.env.KONU_LLM_YOL || ayar.yol || 'otomatik';
  if (yol === 'claude-cli' || yol === 'api') return yol;
  if (claudeBul()) return 'claude-cli';
  if (process.env.ANTHROPIC_API_KEY) return 'api';
  throw new LlmHatasi('Yapay zekâya ulaşılamadı: Claude Code (claude) kurulu değil ve ANTHROPIC_API_KEY yok. konu/BENIOKU.md → "Yapay zekâ bağlantısı".');
}

const CALISMA = path.join(os.tmpdir(), 'video-mutfagi-llm');
function calismaDizini() {
  fs.mkdirSync(CALISMA, { recursive: true });
  fs.writeFileSync(path.join(CALISMA, '.beyin-yok'), 'video-mutfagi konu radari: claude -p cagrilari kisisel ayarlara baglanmaz\n');
  return CALISMA;
}

// tools: [] | ['WebSearch','WebFetch'] | ['Read'] ; dirs: extra readable directories (Read tool)
function cliCalistir(istem, { model, efor, araclar = [], dizinler = [], zamanAsimiMs = 15 * 60e3 }) {
  const bin = claudeBul();
  if (!bin) throw new LlmHatasi('claude bulunamadı. Claude Code kur ya da konu.json → llm.yol: "api" yap.');
  const args = ['-p', '--output-format', 'json', '--setting-sources', 'project,local', '--strict-mcp-config', '--no-session-persistence', '--tools', araclar.join(',')];
  if (araclar.length) args.push('--allowedTools', araclar.join(','));
  if (model) args.push('--model', model);
  if (efor) args.push('--effort', efor);
  for (const d of dizinler) args.push('--add-dir', d);
  const env = { ...process.env, BEYIN_V3_SKIP: '1' };
  delete env.ANTHROPIC_API_KEY;              // the CLI route means "use the subscription", never a stray API key
  // headless machines (servers) log in with a long-lived token from `claude setup-token`, kept outside the repo
  const tokF = path.join(require('os').homedir(), '.video-mutfagi', 'claude.env');
  if (!env.CLAUDE_CODE_OAUTH_TOKEN && fs.existsSync(tokF)) {
    const m = fs.readFileSync(tokF, 'utf8').match(/CLAUDE_CODE_OAUTH_TOKEN=(\S+)/);
    if (m) env.CLAUDE_CODE_OAUTH_TOKEN = m[1];
  }
  return new Promise((coz, reddet) => {
    const p = spawn(bin, args, { cwd: calismaDizini(), env, windowsHide: true });
    let out = '', err = '';
    const zaman = setTimeout(() => { p.kill(); reddet(new LlmHatasi(`claude ${Math.round(zamanAsimiMs / 60000)} dakikada bitmedi.`)); }, zamanAsimiMs);
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', e => { clearTimeout(zaman); reddet(new LlmHatasi('claude çalıştırılamadı: ' + e.message)); });
    p.on('close', kod => {
      clearTimeout(zaman);
      let j; try { j = JSON.parse(out.trim()); } catch (e) { return reddet(new LlmHatasi(`claude çıktısı okunamadı (çıkış ${kod}): ${(err || out).slice(0, 300)}`)); }
      if (j.is_error || kod !== 0) return reddet(new LlmHatasi('claude hata verdi: ' + String(j.result || err).slice(0, 300)));
      coz({ metin: j.result || '', maliyet: j.total_cost_usd || 0 });
    });
    p.stdin.end(istem);
  });
}

// API route (official SDK, loaded only when used so the repo keeps zero required dependencies).
async function apiCalistir(istem, { model, efor, araclar = [], resimler = [] }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new LlmHatasi('ANTHROPIC_API_KEY tanımlı değil.');
  let Anthropic; try { Anthropic = require('@anthropic-ai/sdk'); Anthropic = Anthropic.default || Anthropic; }
  catch (e) { throw new LlmHatasi('API yolu için SDK gerekli: repo klasöründe `npm i @anthropic-ai/sdk`'); }
  const client = new Anthropic();
  const tools = [];
  if (araclar.includes('WebSearch')) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 10 });
  if (araclar.includes('WebFetch')) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 });
  const icerik = [
    ...resimler.map(f => ({ type: 'image', source: { type: 'base64', media_type: /\.png$/i.test(f) ? 'image/png' : 'image/jpeg', data: fs.readFileSync(f).toString('base64') } })),
    { type: 'text', text: istem },
  ];
  const mesajlar = [{ role: 'user', content: icerik }];
  let metin = '';
  for (let tur = 0; tur < 6; tur++) {
    const yanit = await client.beta.messages.stream({
      model: model || 'claude-opus-5-5', max_tokens: 32000, messages: mesajlar,
      output_config: { effort: efor || 'medium' }, ...(tools.length ? { tools } : {}),
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    }).finalMessage();
    if (yanit.stop_reason === 'refusal') throw new LlmHatasi('model isteği reddetti' + (yanit.stop_details && yanit.stop_details.category ? ` (${yanit.stop_details.category})` : ''));
    metin += yanit.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (yanit.stop_reason !== 'pause_turn') break;           // server tools paused a long turn: continue it
    mesajlar.push({ role: 'assistant', content: yanit.content });
  }
  return { metin, maliyet: null };
}

// Pulls the first JSON object out of a reply (```json fences, prose around it).
function jsonCikar(metin) {
  const adaylar = [...String(metin).matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map(m => m[1]).concat([String(metin)]);
  for (const a of adaylar) {
    const son = a.lastIndexOf('}');
    for (let bas = a.indexOf('{'); bas >= 0 && bas < son; bas = a.indexOf('{', bas + 1)) {
      try { const o = JSON.parse(a.slice(bas, son + 1)); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch (e) { }
    }
  }
  throw new LlmHatasi('yapay zekâ yanıtında JSON bulunamadı: ' + String(metin).slice(0, 200));
}

// One call. `is` names the job in the log (kayit/konu/llm.jsonl), which also records time and CLI cost estimate.
async function sor(istem, { is = 'genel', ayar = {}, model, efor, araclar = [], resimler = [], json = true, calistir } = {}) {
  const yol = calistir ? 'test' : yolSec(ayar);
  const t0 = Date.now();
  const dizinler = [...new Set(resimler.map(f => path.dirname(path.resolve(f))))];
  let r;
  if (calistir) r = await calistir(istem, { model, efor, araclar, resimler });
  else if (yol === 'api') r = await apiCalistir(istem, { model, efor, araclar, resimler });
  else {
    const ek = resimler.length ? `\n\nBakman gereken resim dosyaları (Read aracıyla aç):\n${resimler.map(f => '- ' + path.resolve(f)).join('\n')}\n` : '';
    r = await cliCalistir(istem + ek, { model, efor, araclar: resimler.length ? [...new Set([...araclar, 'Read'])] : araclar, dizinler });
  }
  if (!calistir) O.satirEkle(path.join(O.KAYIT, 'llm.jsonl'), { zaman: new Date().toISOString(), is, yol, model, sure_sn: Math.round((Date.now() - t0) / 1000), maliyet_usd: r.maliyet });
  return json ? jsonCikar(r.metin) : r.metin;
}

// Prompt templates live in konu/istemler/*.md with {{name}} slots.
function istem(ad, degerler) {
  const sablon = fs.readFileSync(path.join(__dirname, 'istemler', ad + '.md'), 'utf8');
  return sablon.replace(/\{\{(\w+)\}\}/g, (t, k) => { if (!(k in degerler)) throw new LlmHatasi(`istem ${ad}: {{${k}}} değeri yok`); const v = degerler[k]; return typeof v === 'string' ? v : JSON.stringify(v, null, 1); });
}

module.exports = { sor, istem, jsonCikar, claudeBul, yolSec, LlmHatasi };
