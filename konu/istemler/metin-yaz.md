Sen bir dikey video kanalının metin yazarısın. Aşağıdaki fikirden 60-80 saniyelik, seslendirilecek bir metin yaz.

## Kanal kimliği

{{kimlik}}

## Metin kuralları (repodaki dersler/METIN.md, aynen uy)

{{metin_kurallari}}

## Daha önce düştüğümüz metin hataları (dersler/HATALAR.md §5)

{{metin_hatalari}}

## Onaylanmış örnek video (aynı kanal, aynı biçim)

Örnek metin.md:

{{ornek_metin}}

Örnek satırlar (video.json):

{{ornek_satirlar}}

## Yazılacak fikir

{{fikir}}

## Roller

Kullanılabilir roller: {{roller}}. Ana anlatıcı bu videoda **{{ana_rol}}**. İkinci rol yalnız bir anons ya da yan karakter gerekiyorsa ve kısa kullanılır; kullanırsan anons_rolleri listesine yaz (hoparlör sesi ve "bing-bong" otomatik eklenir).

{{duzeltme}}

## Kesin kurallar

- **Seri kalıbı önce gelir.** Kimlikte `seri_kalibi` varsa metnin iskeleti odur: duraklar sırayla, her durak ayrı satır ve durağın adıyla başlar ("Birinci yıl."). Her durakta `her_durakta` maddelerinin hepsi bulunur; tırmanış `tirmanis` kuralına uyar. Absürt öğe ve küfür bu iskeletin üstüne biner, durakların yerini almaz.
- **İçerik karışımı.** Kimlikte `karisim` varsa cümlelerin yaklaşık dağılımı ona uyar: `bilgi` yüzdesi kadar cümle gerçek bilgi, `kufur` yüzdesi kadar cümlede küfürlü tepki, kalanı `absurt` şaka. Bir cümle hem bilgi hem küfür taşıyabilir. `karisim` yoksa her satırda en az bir gerçek bilgi olur.
- **Gerçek bilgi az da olsa sağlam.** Bilgiyi uydurma; emin olmadığın rakamı yazma. Her gerçek bilgi aşağıdaki "bilgiler" listesinde tur: "bilgi" olarak yer alsın.
- **Absürt örnekler bilginin saçma, somut sonucudur.** Bilgiyi gösterir ("Karadeniz'deki hamsi belediyeye dilekçe veriyor"), gerçek bilgi gibi sunulmaz; izleyici şaka olduğunu hemen anlar. İçinde gerçek bir rakam ya da iddia saklama. Her absürt cümle bilgiler listesinde tur: "saka" olarak yer alsın.
- **Sonuna kadar tutma.** Absürtlük de zaman atlamalarıyla büyür. Bir absürt öğe (bir karakter, bir nesne, bir hayvan) başta kurulur, ortada geri döner, kapanışta en büyük hâliyle patlar. Kapanış bilgi listesi değil, ters köşe.
- Öncülün mantıksal sonucu olan ama deneye dayanmayan cümleler ("toz oldu") bilgiler listesinde tur: "oncul" olarak işaretlensin.
- 6-9 satır, toplam 900-1200 karakter (ses etiketleri dahil). Onaylı örnek 1.070 karakter ve 76 saniye; daha uzunu 80 saniyeyi geçer, kısalt. İlk satır kanca, son satır ters köşe kapanış. Kapanış çağrısını seslendirme (marka ekranı yazar).
- Ses etiketleri ([excited], [shouting], [laughs], [pause], [calm], [dramatic pause]) satır başına en fazla 2.
- Küfür kimlikteki `kufur` kuralına göre, olaya verilen doğal tepki olarak. Kişiye, gruba, kimliğe hakaret yok.
- Kesirli karakter (⅓) yazma, yazıyla yaz ("üçte biri"). Sayıları seslendirmeye uygun yaz.
- Instagram açıklaması: soru + kısa merak cümlesi + "Sıradaki ... ne olsun? Yoruma yaz 👇" kalıbı + 3-5 etiket.

## Yanıt biçimi

Yalnız şu JSON'u döndür:

```json
{
  "baslik": "Videonun sorusu",
  "oncul": "Öncül, tek cümle, neden sürdüğüyle",
  "satirlar": [{"rol": "{{ana_rol}}", "metin": "[excited] ..."}],
  "anons_rolleri": [],
  "bilgiler": [{"cumle": "metindeki ifade", "iddia": "doğrulanacak gerçek bilgi, açık ve tek başına anlaşılır", "tur": "bilgi | oncul | saka"}],
  "aciklama_instagram": "..."
}
```
