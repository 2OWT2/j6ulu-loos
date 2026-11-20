# Jõulu loos

Iga osaleja avab oma kutselingi, sisestab nime ja valib ühe kolmest loosipiletist. Kingisaaja nime nägemiseks kraabi piletit sõrme või hiirega või vajuta „Näita nime“. Rakendus töötab Node.js 24 ja ühe kohaliku SQLite'i failiga. Lisapakette pole vaja.

## Kuidas loosi käivitada

### Cloudflare Workers

Ühenda Git-repositoorium Cloudflare Workers Buildsiga. Worker kasutab failis `wrangler.jsonc` määratud seadistust, kausta `public` ja D1 sidumist `DB`. Jäta ehituskäsk tühjaks ja kasuta juurutuskäsku `npx wrangler deploy`. Wrangler loob D1 andmebaasi esimesel juurutamisel. Juurutusõigustega kontol peab olema õigus D1 andmebaasi luua.

Lisa Workeri seadetes **Variables and Secrets** alla **Secret** nimega `SETUP_SECRET`. Kasuta pikka juhuslikku parooli, salvesta see paroolihaldurisse ja rakenda muudatus. Ava oma Workeri aadressil `/korraldaja`, sisesta võti ja osalejate nimed ning saada loodud kutselingid osalejatele privaatselt.

Esimene edukas loomine salvestab paarid D1 andmebaasi. Sama võtmega saab hiljem kutselingid uuesti avada. Kohaliku prooviloosi andmed jäävad sinu arvutisse.

### Kohalik prooviloos

Asenda näidisnimed oma osalejate nimedega. Pane tühikuga nimed jutumärkidesse. Kui kahel osalejal on sama nimi, lisa näiteks perekonnanime esitäht.

```powershell
node server.mjs setup http://localhost:3000 Oliver Eva Annabel Tom Hans
node server.mjs
```

Esimene käsk väljastab iga osaleja isikliku kutselingi. Salvesta lingid ja saada need osalejatele ükshaaval. Teine käsk käivitab loosi. Selle aadressiga saad loosimist proovida oma arvutis.

Kui osalejad loosivad eri seadmetes, kasuta neile ligipääsetavat HTTPS-aadressi juba `setup`-käsus. Hoia Node'i protsess töös ja `draw.sqlite` fail püsival kettal. Vaikimisi kuulab server aadressil `127.0.0.1`. Vajadusel määra `HOST` ja `PORT`. Eraldi proovi- või pärisloosi jaoks määra `DRAW_DB` kaudu uus failitee.

## Loosireeglid

- Iga osaleja saab ühe kingisaaja. Sama kingisaaja ei kordu ja keegi ei loosi ennast. Kraabitav pilet peidab loosiga määratud nime.
- Osalemiseks on vaja isiklikku linki ja oma nime. Sama brauser näitab kutselingi uuesti avamisel varem loositud nime, kuni brauseri saidiandmed on alles.
- Osaleja näeb ainult oma kingisaajat. Serveri haldaja saab paarid andmefailist välja lugeda, seega hoia fail privaatsena.
