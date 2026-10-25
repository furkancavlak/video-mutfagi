# Denetim: her render'dan sonra

Kullanıcı videoyu görmeden önce ikinci bir yapay zekâ videoyu kare kare izler ve eleştirir. Bulgular doğrulanır, düzeltilir, sonra video gösterilir. İlk denetimde 5/10 alan örnek video, düzeltmelerden sonra yayına çıkacak seviyeye geldi.

## 1. Kare sayfaları

```
bash denetim/kareler.sh videolar/<video>/cikti/<ad>.mp4 videolar/<video>/cikti/denetim
```

- **Çıktı:** Saniyede 1 kare alınır. 4x3 dizilmiş sayfalar `sayfa-01.jpg`, `sayfa-02.jpg`… olarak yazılır.
- **Sayfadan saniyeye:** Sayfa N'deki T. kare, videonun 12×(N−1)+(T−1). saniyesidir.
- **Windows'ta** komut Git Bash ile çalışır (Git kurulumuyla gelir).

## 2. Denetçi ajan

Ajan, ayrı bir alt ajan başlatır (Claude Code'da `Agent` aracı). Daha ucuz bir model yeterlidir; biz Sonnet kullandık.

Alt ajana verilecekler:
- `denetim/kare-denetci.md` dosyası. Kurallar ve çıktı biçimi bu dosyadadır, alt ajan bunlara uyar.
- Kare sayfalarının yolları.
- Videonun kısa hikâyesi: hangi saniyede ne anlatılıyor (`metin.md`'den).
- Bu not: "Saniyede 1 kare bakıyorsun. Hareket eden şeyi donmuş sanabilirsin; 'donmuş' demek için en az 3 aynı kare gerekir."

## 3. Bulguları doğrula, sonra düzelt

Denetçi de yanılır. Örnek videoda bir kısmı saniye eşleme hatasıydı, bir kısmı da 1 karelik örneklemeden doğan yanılgıydı.

1. **Doğrula:** Her bulgu için o saniyenin karesini al:

   ```
   node uretim/kurgu.js videolar/<video> --kare 23.9,30.3      (ücretli: node uretim/ucretli.js <video> kurgu --kare ...)
   ```

   Kareye kendin bak. Doğrulanan bulguyu düzelt.
2. **Kimliğe dokunma:** Kanalın onaylı kimliğini (logo ekranları, altyazı stili, anons kartı) denetçi istedi diye değiştirme.
3. **Yeniden render:** Düzeltmelerden sonra yeniden render al. Büyük değişiklik olduysa denetimi tekrarla.

## 4. Kullanıcıya rapor

Kullanıcıya kısa bir rapor ver:
- denetçinin puanı,
- doğrulanıp düzeltilen bulgular,
- düzeltilmeden bırakılanlar ve nedeni.
