Bir animasyon videosunun karelerini, metni bilmeyen biri tarif etti. Şimdi her karede, o an söylenen cümlenin göstermesi gereken şeyin görülüp görülmediğine karar ver.

Her kare için: o an söylenenler, ve kör denetçinin karede gördükleri.

{{kareler}}

Hikâyenin tonu:

{{ton}}

Kural: söylenen cümle somut bir nesnenin, kişinin ya da olayın adını veriyorsa (araba, uçak, börek, belgesel, papyon, kulaklık, telefon...) o şey kör denetçinin tarifinde geçmeli; eş anlamlısı ya da açıkça aynı şey olan tarif de sayılır ("otomobil" = "araba"). Soyut cümlelerde (duygu, düşünce, "ama nasıl?") somut bir şey aranmaz; o kareyi atla. Tarifte "anlaşılmayan şekil" geçiyorsa ve cümle somut bir şey söylüyorsa bu da eksiktir.

Ton kuralı: hikâye komik değilse, kör denetçinin tarifinde çizgi film abartısı (ter damlası, şok çizgileri, fırlayan gözler, yıldızlar, emoji gibi ya da gülen/alaycı yüz), komik tabela ya da yazı, neşeli parlak renkler ya da ölüm, hastalık, şiddetin çıplak gösterilmesi geçiyorsa `ton_sorunlari` listesine yaz. Komik hikâyede bu liste boş kalır.

Yalnız şu JSON'u döndür (eksik yoksa boş liste):

```json
{"eksikler": [{"saniye": 64.0, "beklenen": "uzaklaşan araba", "gorulen": "boş yol ve bir adam"}], "ton_sorunlari": [{"saniye": 12.0, "sorun": "cenaze sahnesinde ter damlalı şaşkın yüz"}]}
```
