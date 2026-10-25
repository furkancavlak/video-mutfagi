// Picking the clip "nesil nesil" (generation by generation), the method of our first promo shorts:
//   1. three writers, each from its own angle, propose 2 cut lists from the transcript
//   2. three judges (a fast scroller, a curious viewer, a retention editor) score every candidate
//   3. two writers improve the scored generation: one fixes what the judges criticised, one crosses the best parts
//   4. the same three judges score the new ones together with the 2 best of generation 1
// Every candidate is resolved against the Whisper words by our own code (kesim.coz) before a judge sees it:
// a phrase that is not in the transcript or a clip outside the length limits goes back to its writer once.
// Language model: konu/llm.js (`claude -p` with the user's subscription, or the API). Without one, kesim.sezgisel.
const fs = require('fs'), path = require('path');
const LLM = require('../konu/llm');
const KS = require('./kesim');

const MOD_TARIFI = {
  tanitim: `Tanıtım kısası (teaser). Amaç izleyiciyi tam videoya göndermek.
- Videonun en çarpıcı cümlesiyle açılır. Selam, giriş, yavaş hazırlık yok.
- 2-3 hızlı vuruşla merak büyür.
- İzleyicinin artık cevabı merak ettiği yerde, cevaptan HEMEN ÖNCE kesilir. Cevap gerçekten tam videoda olmalı.
- Ardından kart gelir: kısa soru + "CEVAP TAM VİDEODA".`,
  an: `En iyi an kısası. Videonun kendi başına anlaşılan, en güçlü tek anı.
- Güçlü bir cümleyle açılır, düşünce tamamlanınca biter (yarım kalmaz, soruyla bitmez).
- Ardından kısa bir kart gelir: "TAM VİDEO KANALDA".`,
};

function kurallar(mod) {
  const M = KS.MODLAR[mod];
  const ortak = [
    `Ses toplamı ${M.hedef[0]}-${M.hedef[1]} sn (kesin sınır ${M.sinir[0]}-${M.sinir[1]} sn). Kart bunun üstüne ~${Math.round(M.kart)} sn ekler. En fazla ${M.enCok} parça.`,
    'İlk saniye tutmalı: yavaş bir girişle değil, en çarpıcı cümleyle başla.',
    'Her parça bir cümle ya da yan cümle sınırında başlar ve biter. Arka arkaya duyulunca ek yerleri doğal okunmalı.',
    'Anlamı değiştirecek birleştirme yapma, videoda olmayan bir iddia kurma. Hikâye doğru kaldıkça parçaların sırası değişebilir.',
    'Giriş/kapanış kalıpları (selam, abone ol, yorum yaz) kısaya girmez.',
  ];
  if (mod === 'tanitim') ortak.push('CEVABI SÖYLEME: ne seste, ne kancada, ne karttaki soruda.', '"soru": karttaki soru, 2-4 kelime, büyük harf, ? ile biter (ör. "HANGİSİ DAHA İYİ?").');
  else ortak.push('Son cümle düşünceyi tamamlar; soru ya da yarım cümleyle bitmez. "soru" boş kalabilir.');
  ortak.push('"kanca": ilk karedeki başlık, en fazla 4 kelime, büyük harf, doğru, tercihen konuşmanın kendi kelimeleri. Gerek yoksa boş bırak.');
  return ortak.map(k => '- ' + k).join('\n');
}

const ACILAR = [
  'SAKLA: dökümdeki en çarpıcı tek cümleyle aç, 2-3 hızlı vuruşla büyüt, cevaptan hemen önce kes.',
  'SORU: izleyiciye (konuşmanın içinden) bir soruyla meydan okuyarak aç, merakı yükselt, aynı cevapsız soruda bitir.',
  'SERBEST: en cesur fikrin. Kancayı videonun herhangi bir yerinden (ör. açılıştaki vaat) alabilir, parçaların sırasını değiştirebilirsin; yeter ki doğru kalsın.',
];
const ACILAR_AN = [
  'EN GÜÇLÜ CÜMLE: videonun en güçlü cümlesini bul, onu taşıyan kendi başına anlaşılır parçayı kes.',
  'HİKÂYE: başı-ortası-sonu olan küçük bir anı bul (bir deneme, bir sonuç, bir şaşırma).',
  'SERBEST: en cesur fikrin; gerekirse iki uzak cümleyi doğru kalarak birleştir.',
];
const JURI = [
  '18-35 yaşında, parmağı hızlı kayan bir Reels/Shorts izleyicisi. Bir videoya 1-2 saniye verirsin; yavaş açılıştan ve belirsiz sondan nefret edersin.',
  'Videonun konusunu merak eden ama uzun videoyu henüz izlememiş biri. Ne anlatıldığını anlıyor musun, sonunda gerçekten devamını istiyor musun?',
  'Kısa video kurgucusu ve kural hakemi. Her ek yerinin akışını, süreyi, doğruluğu ve sondaki merakın gerçek ve cevapsız olduğunu kontrol edersin.',
];

const doldur = (ad, d) => fs.readFileSync(path.join(__dirname, 'istemler', ad + '.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (t, k) => {
  if (!(k in d)) throw new Error(`istem ${ad}: {{${k}}} değeri yok`);
  return typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k]);
});

// a writer's reply -> resolved candidates (bad ones carry their errors)
function coz(adaylar, etiket, ctx) {
  return (adaylar || []).filter(a => a && Array.isArray(a.parcalar)).map((a, i) => {
    const r = KS.coz(a.parcalar, ctx.W, ctx.S, ctx.mod);
    return { ad: `${etiket}${'abcdef'[i] || i}`, parcalar: a.parcalar, kanca: String(a.kanca || '').trim(), soru: String(a.soru || '').trim(), neden: a.neden || '', sure: r.son, dene: KS.deneMetni(r), hata: r.hata };
  });
}

async function yazdir(ctx, gorev, etiket) {
  const istem = doldur('yazar', { mod_tarifi: MOD_TARIFI[ctx.mod], kurallar: kurallar(ctx.mod), gorev, ek_not: ctx.not ? `## Kanal sahibinin notu\n\n${ctx.not}` : '', metin: ctx.metin });
  let ad = coz((await ctx.sor(istem, { is: 'kesit-yaz', efor: 'high' })).adaylar, etiket, ctx);
  const kotu = ad.filter(a => a.hata.length);
  if (kotu.length) {                     // one repair round: the writer sees exactly what our resolver printed
    ctx.yaz(`  ${etiket}: ${kotu.length} aday düzeltmeye gitti`);
    const duzelt = `${gorev}\n\nÖnceki adaylarının bazıları geçersiz çıktı. Sistemin çıktısı aşağıda. Bunları düzelt (ifadeyi dökümdeki kelimelerle birebir yaz, süreyi sınıra sok), geçerli olanları aynen koru:\n\n${ad.map(a => `### ${a.ad}\n${JSON.stringify({ parcalar: a.parcalar, kanca: a.kanca, soru: a.soru })}\n${a.dene}`).join('\n\n')}`;
    const istem2 = doldur('yazar', { mod_tarifi: MOD_TARIFI[ctx.mod], kurallar: kurallar(ctx.mod), gorev: duzelt, ek_not: ctx.not ? `## Kanal sahibinin notu\n\n${ctx.not}` : '', metin: ctx.metin });
    try { ad = coz((await ctx.sor(istem2, { is: 'kesit-onar', efor: 'medium' })).adaylar, etiket, ctx); } catch (e) { ctx.yaz(`  ${etiket}: düzeltme başarısız (${e.message})`); }
  }
  const iyi = ad.filter(a => !a.hata.length);
  if (ad.length > iyi.length) ctx.yaz(`  ${etiket}: ${ad.length - iyi.length} aday atıldı (${ad.filter(a => a.hata.length).map(a => a.hata[0]).join('; ')})`);
  return iyi;
}

async function puanla(ctx, adaylar, tur) {
  const liste = adaylar.map(a => `### ${a.ad}\nKANCA: ${a.kanca || '(yok)'} | KART: ${a.soru ? a.soru + ' / ' : ''}${ctx.mod === 'tanitim' ? 'CEVAP TAM VİDEODA' : 'TAM VİDEO KANALDA'} | SES ${a.sure.toFixed(1)} sn\n${a.dene}`).join('\n\n');
  const jr = (await Promise.all(JURI.map(kim => ctx.sor(doldur('juri', { mod_tarifi: MOD_TARIFI[ctx.mod], kim, kurallar: kurallar(ctx.mod), adaylar: liste }), { is: `kesit-juri${tur}`, efor: 'medium' }).catch(e => { ctx.yaz(`  bir jüri cevap vermedi (${e.message})`); return null; })))).filter(Boolean);
  if (!jr.length) throw new LLM.LlmHatasi('hiçbir jüri cevap vermedi');
  return adaylar.map(a => {
    const ps = jr.map(j => (j.puanlar || []).find(p => p.ad === a.ad)).filter(Boolean);
    const ort = ps.length ? ps.reduce((s, p) => s + (+p.puan || 0), 0) / ps.length : 0, ihlal = ps.some(p => p.ihlal);
    return { ...a, skor: +(ort - (ihlal ? 15 : 0)).toFixed(1), ihlal, notlar: ps.map(p => p.not).join(' | ') };
  }).sort((x, y) => y.skor - x.skor);
}

const kaynakAraligi = (a, ctx) => { const r = KS.coz(a.parcalar, ctx.W, ctx.S, ctx.mod); return [Math.min(...r.kesit.map(k => k.v0)), Math.max(...r.kesit.map(k => k.v1))]; };

// W: Whisper words, S: sentences. Returns the best `adet` candidates, best first, plus the whole history.
async function nesil({ W, S, mod = 'tanitim', adet = 1, not = '', model, yaz = console.log, calistir }) {
  const ctx = { W, S, mod, not, yaz, metin: S.map(s => `[${s.i}] ${s.a.toFixed(1)}–${s.b.toFixed(1)} sn: ${s.metin}`).join('\n'),
    sor: (istem, o) => LLM.sor(istem, { model, calistir, ...o }) };
  const fazla = adet > 1 ? `\nKanal sahibi ${adet} ayrı kısa istiyor: adaylarını videonun FARKLI bölümlerinden seç.` : '';
  const acilar = mod === 'an' ? ACILAR_AN : ACILAR;

  yaz('Nesil 1: üç yazar aday yazıyor…');
  const n1 = (await Promise.all(acilar.map((aci, i) => yazdir(ctx, `AÇI: ${aci}\n2 farklı aday yaz.${fazla}`, `n1-${i + 1}`).catch(e => { yaz(`  yazar ${i + 1} cevap vermedi (${e.message})`); return []; })))).flat();
  if (!n1.length) throw new LLM.LlmHatasi('birinci nesilde geçerli aday çıkmadı');
  yaz(`Jüri 1: ${n1.length} aday puanlanıyor…`);
  const p1 = await puanla(ctx, n1, 1);
  yaz('  ' + p1.slice(0, 3).map(a => `${a.skor} ${a.ad} (${a.sure.toFixed(1)} sn)`).join(' / '));

  const tablo = p1.map(a => `### ${a.ad}, SKOR ${a.skor}${a.ihlal ? ' (İHLAL)' : ''}\n${JSON.stringify({ parcalar: a.parcalar, kanca: a.kanca, soru: a.soru })}\n${a.dene}\nJÜRİ: ${a.notlar}`).join('\n\n');
  const MUT = [
    ['duzelt', 'En iyi 2 adayı al, jürinin eleştirdiği şeyi (açılış, ek yerleri, son, süre) tam olarak düzelt. Puan alan yanını koru.'],
    ['capraz', 'Bir adayın en güçlü açılışını başka bir adayın en güçlü sonuyla birleştir ya da jürinin ima ettiği yeni bir fikri dene.'],
  ];
  yaz('Nesil 2: iki yazar puanlı adayları geliştiriyor…');
  const n2 = (await Promise.all(MUT.map(([ad, gorev]) => yazdir(ctx, `Birinci nesil, üç jüri tarafından puanlandı (en iyi başta):\n\n${tablo}\n\nGÖREV (${ad}): ${gorev}\n2 yeni aday yaz.${fazla}`, `n2-${ad}-`).catch(e => { yaz(`  geliştirici ${ad} cevap vermedi (${e.message})`); return []; })))).flat();
  const havuz = [...n2, ...p1.slice(0, 2).map(({ skor, ihlal, notlar, ...a }) => a)];
  yaz(`Jüri 2: ${havuz.length} aday puanlanıyor…`);
  const p2 = await puanla(ctx, havuz, 2);
  yaz('  ' + p2.slice(0, 3).map(a => `${a.skor} ${a.ad} (${a.sure.toFixed(1)} sn)`).join(' / '));

  const sirali = p2.filter(a => !a.ihlal).concat(p2.filter(a => a.ihlal)).map(a => ({ ...a, kaynak: kaynakAraligi(a, ctx) }));
  return { secilen: KS.enIyiler(sirali, adet), nesil1: p1, nesil2: p2 };
}

module.exports = { nesil, kurallar, MOD_TARIFI };
