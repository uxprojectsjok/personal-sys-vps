// app/composables/useSoulEncrypt.js
// BIP39-Mnemonic + PBKDF2-Key-Derivation + AES-GCM-Verschlüsselung
// Alle Crypto-Operationen ausschließlich via Web Crypto API (window.crypto.subtle).
// Das erzeugte Bundle ist mit jedem Standard-Krypto-Tool ohne diese App entschlüsselbar.

import { ref } from "vue";

// ── BIP39 English Wordlist (2048 Wörter, offizieller Standard) ──────────────
// Quelle: https://github.com/trezor/python-mnemonic/blob/master/src/mnemonic/wordlist/english.txt
export const BIP39 = ["abandon","ability","able","about","above","absent","absorb","abstract","absurd","abuse","access","accident","account","accuse","achieve","acid","acoustic","acquire","across","act","action","actor","actress","actual","adapt","add","addict","address","adjust","admit","adult","advance","advice","aerobic","afford","afraid","again","age","agent","agree","ahead","aim","air","airport","aisle","alarm","album","alcohol","alert","alien","all","alley","allow","almost","alone","alpha","already","also","alter","always","amateur","amazing","among","amount","amused","analyst","anchor","ancient","anger","angle","angry","animal","ankle","announce","annual","another","answer","antenna","antique","anxiety","any","apart","apology","appear","apple","approve","april","arch","arctic","area","arena","argue","arm","armed","armor","army","around","arrange","arrest","arrive","arrow","art","artefact","artist","artwork","ask","aspect","assault","asset","assist","assume","asthma","athlete","atom","attack","attend","attitude","attract","auction","audit","august","aunt","author","auto","autumn","average","avocado","avoid","awake","aware","away","awesome","awful","awkward","axis","baby","balance","bamboo","banana","banner","bar","barely","bargain","barrel","base","basic","basket","battle","beach","bean","beauty","because","become","beef","before","begin","behave","behind","believe","below","belt","bench","benefit","best","betray","better","between","beyond","bicycle","bid","bike","bind","biology","bird","birth","bitter","black","blade","blame","blanket","blast","bleak","bless","blind","blood","blossom","blouse","blue","blur","blush","board","boat","body","boil","bomb","bone","book","boost","border","boring","borrow","boss","bottom","bounce","box","boy","bracket","brain","brand","brave","breeze","brick","bridge","brief","bright","bring","brisk","broccoli","broken","bronze","broom","brother","brown","brush","bubble","buddy","budget","buffalo","build","bulb","bulk","bullet","bundle","bunker","burden","burger","burst","bus","business","busy","butter","buyer","buzz","cabbage","cabin","cable","cactus","cage","cake","call","calm","camera","camp","can","canal","cancel","candy","cannon","canvas","canyon","capable","capital","captain","car","carbon","card","cargo","carpet","carry","cart","case","cash","casino","castle","casual","cat","catalog","catch","category","cattle","caught","cause","caution","cave","ceiling","celery","cement","census","century","cereal","certain","chair","chalk","champion","change","chaos","chapter","charge","chase","chat","cheap","check","cheese","chef","cherry","chest","chicken","chief","child","chimney","choice","choose","chronic","chuckle","chunk","cigar","cinnamon","circle","citizen","city","civil","claim","clap","clarify","claw","clay","clean","clerk","clever","click","client","cliff","climb","clinic","clip","clock","clog","close","cloth","cloud","clown","club","clump","cluster","clutch","coach","coast","coconut","code","coffee","coil","coin","collect","color","column","combine","come","comfort","comic","common","company","concert","conduct","confirm","congress","connect","consider","control","convince","cook","cool","copper","copy","coral","core","corn","correct","cost","cotton","couch","country","couple","course","cousin","cover","coyote","crack","cradle","craft","cram","crane","crash","crazy","cream","credit","creek","crew","cricket","crime","crisp","critic","cross","crouch","crowd","crucial","cruel","cruise","crumble","crunch","crush","cry","crystal","cube","culture","cup","cupboard","curious","current","curtain","curve","cushion","custom","cute","cycle","dad","damage","damp","dance","danger","daring","dash","daughter","dawn","day","deal","debate","debris","decade","december","decide","decline","decorate","decrease","deer","defense","define","defy","degree","delay","deliver","demand","demise","denial","dentist","deny","depart","depend","deposit","depth","deputy","derive","describe","desert","design","desk","despair","destroy","detail","detect","develop","device","devote","diagram","dial","diamond","diary","dice","diesel","diet","differ","digital","dignity","dilemma","dinner","dinosaur","direct","dirt","disagree","discover","disease","dish","dismiss","disorder","display","distance","divert","divide","divorce","dizzy","doctor","document","dog","doll","dolphin","domain","donate","donkey","donor","door","dose","double","dove","draft","dragon","drama","drastic","draw","dream","dress","drift","drill","drink","drip","drive","drop","drum","dry","duck","dumb","dune","during","dust","dutch","duty","dwarf","dynamic","eager","eagle","early","earn","earth","easily","east","easy","echo","ecology","economy","edge","edit","educate","effort","egg","eight","either","elbow","elder","electric","elegant","element","elephant","elevator","elite","else","embark","embody","embrace","emerge","emotion","employ","empower","empty","enable","enact","endless","endorse","enemy","energy","enforce","engage","engine","enhance","enjoy","enlist","enough","enrich","enroll","ensure","enter","entire","entry","envelope","episode","equal","equip","erase","erosion","escape","essay","essence","estate","eternal","ethics","evidence","evil","evoke","evolve","exact","example","excess","exchange","excite","exclude","exercise","exhaust","exhibit","exile","exist","exit","exotic","expand","expire","explain","expose","express","extend","extra","eye","fable","face","faculty","faint","faith","fall","false","fame","family","famous","fan","fancy","fantasy","far","fashion","fat","fatal","father","fatigue","fault","favorite","feature","february","federal","fee","feed","feel","feet","fellow","felt","fence","festival","fetch","fever","few","fiber","fiction","field","figure","file","film","filter","final","find","fine","finger","finish","fire","firm","first","fiscal","fish","fit","fitness","fix","flag","flame","flash","flat","flavor","flee","flight","flip","float","flock","floor","flower","fluid","flush","fly","foam","focus","fog","foil","follow","food","foot","force","forest","forget","fork","fortune","forum","forward","fossil","foster","found","fox","fragile","frame","frequent","fresh","friend","fringe","frog","front","frost","frown","frozen","fruit","fuel","fun","funny","furnace","fury","future","gadget","gain","galaxy","gallery","game","gap","garbage","garden","garlic","garment","gas","gasp","gate","gather","gauge","gaze","general","genius","genre","gentle","genuine","gesture","ghost","giant","gift","giggle","ginger","giraffe","girl","give","glad","glance","glare","glass","glide","glimpse","globe","gloom","glory","glove","glow","glue","goat","goddess","gold","good","goose","gorilla","gospel","gossip","govern","gown","grab","grace","grain","grant","grape","grasp","grass","gravity","great","green","grid","grief","grit","grocery","group","grow","grunt","guard","guide","guilt","guitar","gun","gym","habit","hair","half","hamster","hand","happy","harsh","harvest","hat","have","hawk","hazard","head","health","heart","heavy","hedgehog","height","hello","helmet","help","hero","hidden","high","hill","hint","hip","hire","history","hobby","hockey","hold","hole","holiday","hollow","home","honey","hood","hope","horn","hospital","host","hour","hover","hub","huge","human","humble","humor","hundred","hungry","hunt","hurdle","hurry","hurt","husband","hybrid","ice","icon","ignore","ill","illegal","image","imitate","immense","immune","impact","impose","improve","impulse","inbox","income","increase","index","indicate","indoor","industry","infant","inflict","inform","inhale","inject","inner","innocent","input","inquiry","insane","insect","inside","inspire","install","intact","interest","into","invest","invite","involve","island","isolate","issue","item","ivory","jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel","job","join","joke","journey","joy","judge","juice","jump","jungle","junior","junk","just","kangaroo","keen","keep","ketchup","key","kick","kid","kingdom","kiss","kit","kitchen","kite","kitten","kiwi","knee","knife","knock","know","lab","lamp","language","laptop","large","later","laugh","laundry","lava","law","lawn","lawsuit","layer","lazy","leader","learn","leave","lecture","left","leg","legal","legend","lemon","lend","length","lens","leopard","lesson","letter","level","liar","liberty","library","license","life","lift","like","limb","limit","link","lion","liquid","list","little","live","lizard","load","loan","lobster","local","lock","logic","lonely","long","loop","lottery","loud","lounge","love","loyal","lucky","luggage","lumber","lunar","lunch","luxury","mad","magic","magnet","maid","main","mammal","mango","mansion","manual","maple","marble","march","margin","marine","market","marriage","mask","master","match","material","math","matrix","matter","maximum","maze","meadow","mean","medal","media","melody","melt","member","memory","mention","menu","mercy","merge","merit","merry","mesh","message","metal","method","middle","midnight","milk","million","mimic","mind","minimum","minor","minute","miracle","miss","mixture","mobile","model","modify","mom","monitor","monkey","monster","month","moon","moral","more","morning","mosquito","mother","motion","motor","mountain","mouse","move","movie","much","muffin","mule","multiply","muscle","museum","mushroom","music","must","mutual","myself","mystery","naive","name","napkin","narrow","nasty","nature","near","neck","need","negative","neglect","neither","nephew","nerve","nest","network","news","next","nice","night","noble","noise","nominee","noodle","normal","north","notable","note","nothing","notice","novel","now","nuclear","number","nurse","nut","oak","obey","object","oblige","obscure","obtain","ocean","october","odor","off","offer","office","often","oil","okay","old","olive","olympic","omit","once","onion","open","option","orange","orbit","orchard","order","ordinary","organ","orient","original","orphan","ostrich","other","outdoor","outside","oval","over","own","oyster","ozone","pact","paddle","page","pair","palace","palm","panda","panel","panic","panther","paper","parade","parent","park","parrot","party","pass","patch","path","patrol","pause","pave","payment","peace","peanut","pear","peasant","pelican","pen","penalty","pencil","people","pepper","perfect","permit","person","pet","phone","photo","phrase","physical","piano","picnic","picture","piece","pig","pigeon","pill","pilot","pink","pioneer","pipe","pistol","pitch","pizza","place","planet","plastic","plate","play","please","pledge","pluck","plug","plunge","poem","poet","point","polar","pole","police","pond","pony","pool","popular","portion","position","possible","post","potato","pottery","poverty","powder","power","practice","praise","predict","prefer","prepare","present","pretty","prevent","price","pride","primary","print","priority","prison","private","prize","problem","process","produce","profit","program","project","promote","proof","property","prosper","protect","proud","provide","public","pudding","pull","pulp","pulse","pumpkin","punish","pupil","purchase","purity","push","put","puzzle","pyramid","quality","quantum","quarter","question","quick","quit","quiz","quote","rabbit","raccoon","race","rack","radar","radio","rage","rail","rain","raise","rally","ramp","ranch","random","range","rapid","rare","rate","rather","raven","reach","ready","real","reason","rebel","rebuild","recall","receive","recipe","record","recycle","reduce","reflect","reform","refuse","region","regret","regular","reject","relax","release","relief","rely","remain","remember","remind","remove","render","renew","rent","reopen","repair","repeat","replace","report","require","rescue","resemble","resist","resource","response","result","retire","retreat","return","reunion","reveal","review","reward","rhythm","ribbon","rid","ride","ridge","rifle","right","rigid","ring","riot","ripple","risk","ritual","rival","river","road","roast","robot","robust","rocket","romance","roof","rookie","round","route","royal","rubber","rude","rug","rule","run","runway","rural","sad","saddle","sadness","safe","sail","salad","salmon","salon","salt","salute","same","sample","sand","satisfy","satoshi","sauce","sausage","save","say","scale","scan","scare","scatter","scene","scheme","science","scissors","scorpion","scout","scrap","screen","script","scrub","sea","search","season","seat","second","secret","section","security","seek","segment","select","sell","seminar","senior","sense","sentence","series","service","session","settle","setup","seven","shadow","shaft","shallow","share","shed","shell","sheriff","shield","shift","shine","ship","shiver","shock","shoe","shoot","shop","short","shoulder","shove","shrimp","shrug","shuffle","shy","sibling","siege","sight","sign","silent","silk","silly","silver","similar","simple","since","sing","siren","sister","situate","six","size","sketch","skill","skin","skirt","skull","slab","slam","sleep","slender","slice","slide","slight","slim","slogan","slot","slow","slush","small","smart","smile","smoke","smooth","snack","snake","snap","sniff","snow","soap","soccer","social","sock","solar","soldier","solid","solution","solve","someone","song","soon","sorry","soul","sound","soup","source","south","space","spare","spatial","spawn","speak","special","speed","sphere","spice","spider","spike","spin","spirit","split","spoil","sponsor","spoon","spray","spread","spring","spy","square","squeeze","squirrel","stable","stadium","staff","stage","stairs","stamp","stand","start","state","stay","steak","steel","stem","step","stereo","stick","still","sting","stock","stomach","stone","stop","store","stream","street","strike","strong","struggle","student","stuff","stumble","submit","subway","success","such","sudden","suffer","suggest","suit","summer","sun","sunny","sunset","super","supply","supreme","sure","surface","surge","surprise","surround","survey","suspect","sustain","swallow","swamp","swap","swear","sweet","swift","swim","swing","switch","sword","symbol","symptom","syrup","table","tackle","tag","tail","talent","tank","tape","target","task","tattoo","taxi","teach","team","tell","ten","tenant","tennis","tent","term","test","text","thank","that","theme","then","theory","there","they","thing","this","thought","three","thrive","throw","thumb","thunder","ticket","tilt","timber","time","tiny","tip","tired","title","toast","tobacco","today","together","toilet","token","tomato","tomorrow","tone","tongue","tonight","tool","tooth","top","topic","topple","torch","tornado","tortoise","toss","total","tourist","toward","tower","town","toy","track","trade","traffic","tragic","train","transfer","trap","trash","travel","tray","treat","tree","trend","trial","tribe","trick","trigger","trim","trip","trophy","trouble","truck","truly","trumpet","trust","truth","try","tube","tuition","tumble","tuna","tunnel","turkey","turn","turtle","twelve","twenty","twice","twin","twist","two","type","typical","ugly","umbrella","unable","uncle","uncover","under","undo","unfair","unfold","unhappy","uniform","unique","universe","unknown","unlock","until","unusual","unveil","update","upgrade","uphold","upon","upper","upset","urban","useful","useless","usual","utility","vacant","vacuum","vague","valid","valley","valve","van","vanish","vapor","various","vast","vault","vehicle","velvet","vendor","venture","venue","verb","verify","version","very","veteran","viable","vibrant","vicious","victory","video","view","village","vintage","violin","virtual","virus","visa","visit","visual","vital","vivid","vocal","voice","void","volcano","volume","vote","voyage","wage","wagon","wait","walk","wall","walnut","want","warfare","warm","warrior","waste","water","wave","way","wealth","weapon","wear","weasel","wedding","weekend","weird","welcome","well","west","wet","whale","wheat","wheel","where","whip","whisper","wide","width","wife","wild","will","win","window","wine","wing","wink","winner","winter","wire","wisdom","wise","wish","witness","wolf","woman","wonder","wood","wool","word","world","worry","worth","wrap","wreck","wrestle","wrist","write","wrong","yard","year","yellow","you","young","youth","zebra","zero","zone","zoo"];

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/**
 * ArrayBuffer → Base64-String (chunk-safe, kein Stack-Overflow bei großen Buffern)
 */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generiert 12 BIP39-Wörter aus 128 Bit Entropie.
 * Jedes Wort entspricht einem 11-Bit-Index in der 2048-Wörter-Liste.
 */
export function generateMnemonicWords() {
  // 16 zufällige Bytes = 128 Bit Entropie
  const entropy = crypto.getRandomValues(new Uint8Array(16));

  // Bits extrahieren: 12 × 11 Bit = 132 Bit, letzte 4 Bits mit 0 aufgefüllt
  const words = [];
  let bitBuffer = BigInt(0);
  let bitCount = 0;

  for (const byte of entropy) {
    bitBuffer = (bitBuffer << 8n) | BigInt(byte);
    bitCount += 8;
  }
  // Auf 132 Bit auffüllen (4 Padding-Bits für 12 × 11 = 132)
  bitBuffer = bitBuffer << 4n;
  bitCount += 4;

  // 12 × 11-Bit-Chunks extrahieren
  for (let i = 0; i < 12; i++) {
    bitCount -= 11;
    const idx = Number((bitBuffer >> BigInt(bitCount)) & 0x7FFn);
    words.push(BIP39[idx]);
  }

  return words;
}

/**
 * Leitet einen AES-256-GCM-Schlüssel aus der Mnemonic-Phrase ab.
 * Standard: PBKDF2 + SHA-256, 100 000 Iterationen.
 */
async function deriveKey(mnemonicWords) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(mnemonicWords.join(" ")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       enc.encode("SaveYourSoul-v1"),
      iterations: 100_000,
      hash:       "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

/**
 * Verschlüsselt eine einzelne Datei mit AES-GCM.
 * content kann ein String (Text) oder ein ArrayBuffer/Uint8Array (Binär) sein.
 * Gibt { name, iv, data } als Base64-Strings zurück.
 */
async function encryptFile(cryptoKey, name, content) {
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = typeof content === "string"
    ? new TextEncoder().encode(content)
    : new Uint8Array(content);
  const cipher    = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
  return {
    name,
    iv:   toBase64(iv),
    data: toBase64(cipher),
  };
}

/**
 * Baut das selbstdokumentierende Bundle zusammen.
 * Entschlüsselbar mit jedem Standard-Krypto-Tool ohne diese App.
 * Enthält vollständige Python- und Node.js-Beispiele direkt im Bundle.
 */
function assembleBundle(encryptedFiles) {
  // ── Python-Beispiel (benötigt: pip install cryptography) ─────────────────
  const decryptPython = [
    "# Requires: pip install cryptography",
    "# Usage:    python decrypt_soul.py your-soul-file.soul",
    "import base64, hashlib, json, os, sys",
    "from cryptography.hazmat.primitives.ciphers.aead import AESGCM",
    "",
    "bundle_path = sys.argv[1] if len(sys.argv) > 1 else 'soul.soul'",
    "bundle      = json.load(open(bundle_path, encoding='utf-8'))",
    "",
    "# Ersetze die Wörter unten durch deine 12 eigenen Schlüsselwörter:",
    "words    = ['word1','word2','word3','word4','word5','word6',",
    "            'word7','word8','word9','word10','word11','word12']",
    "password = ' '.join(words)",
    "",
    "salt = base64.b64decode(bundle['kdf_params']['salt'])",
    "key  = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100_000, 32)",
    "",
    "for f in bundle['files']:",
    "    iv   = base64.b64decode(f['iv'])",
    "    data = base64.b64decode(f['data'])",
    "    # AESGCM erwartet ciphertext + auth-tag (16 Bytes) – genau unser Format",
    "    plain = AESGCM(key).decrypt(iv, data, None)",
    "    # Unterordner anlegen wenn nötig (z.B. 'voice_samples/voice.webm')",
    "    path   = f['name'].replace('/', os.sep)",
    "    parent = os.path.dirname(path)",
    "    if parent:",
    "        os.makedirs(parent, exist_ok=True)",
    "    open(path, 'wb').write(plain)",
    "    print(f'  ✓  {f[\"name\"]}')",
    "print('Fertig. Alle Dateien entschlüsselt.')",
  ].join("\n");

  // ── Node.js-Beispiel (kein externes Paket nötig) ─────────────────────────
  const decryptNodejs = [
    "// Node.js >= 16 – no external dependencies",
    "// Usage:  node decrypt_soul.js your-soul-file.soul",
    "const crypto = require('crypto');",
    "const fs     = require('fs');",
    "const path   = require('path');",
    "",
    "const bundlePath = process.argv[2] || 'soul.soul';",
    "const bundle     = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));",
    "",
    "// Ersetze die Wörter unten durch deine 12 eigenen Schlüsselwörter:",
    "const password = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';",
    "const salt     = Buffer.from(bundle.kdf_params.salt, 'base64');",
    "const key      = crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256');",
    "",
    "for (const f of bundle.files) {",
    "  const iv         = Buffer.from(f.iv,   'base64');",
    "  const raw        = Buffer.from(f.data, 'base64');",
    "  // AES-GCM: Web Crypto hängt 16-Byte Auth-Tag ans Ende",
    "  const authTag    = raw.slice(-16);",
    "  const ciphertext = raw.slice(0, -16);",
    "  const decipher   = crypto.createDecipheriv('aes-256-gcm', key, iv);",
    "  decipher.setAuthTag(authTag);",
    "  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);",
    "  // Unterordner anlegen wenn nötig (z.B. 'voice_samples/voice.webm')",
    "  const filePath = f.name.split('/').join(path.sep);",
    "  const dir = path.dirname(filePath);",
    "  if (dir !== '.') fs.mkdirSync(dir, { recursive: true });",
    "  fs.writeFileSync(filePath, plain);",
    "  console.log('  ✓ ', f.name);",
    "}",
    "console.log('Fertig. Alle Dateien entschlüsselt.');",
  ].join("\n");

  // ── Klartextanleitung ─────────────────────────────────────────────────────
  const instructions = [
    "HOW TO DECRYPT THIS VAULT",
    "=========================",
    "1. Remember your 12-word passphrase.",
    "2. Key derivation:",
    "     PBKDF2(password = '12 words separated by single space',",
    "            salt     = base64decode(kdf_params.salt),",
    "            iterations = 100 000,",
    "            hash     = SHA-256,",
    "            key_length = 32 bytes / 256 bit)",
    "3. For each file in files[]:",
    "     iv         = base64decode(file.iv)       // 12 bytes",
    "     ciphertext = base64decode(file.data)     // includes 16-byte GCM auth tag at end",
    "     plaintext  = AES-256-GCM-decrypt(key, iv, ciphertext)",
    "     save as file.name",
    "4. No proprietary software required.",
    "   See decrypt_python and decrypt_nodejs fields for complete working scripts.",
  ].join("\n");

  return {
    schema:    "saveyoursoul/vault/1.0",
    algorithm: "AES-256-GCM",
    kdf:       "PBKDF2-SHA-256",
    kdf_params: {
      hash:       "SHA-256",
      iterations: 100_000,
      salt:       "U2F2ZVlvdXJTb3VsLXYx",   // base64("SaveYourSoul-v1")
      key_length: 256,                         // Bit
    },
    created:         new Date().toISOString().split("T")[0],
    files:           encryptedFiles,
    instructions,
    decrypt_python:  decryptPython,
    decrypt_nodejs:  decryptNodejs,
  };
}

/**
 * Lädt das Bundle als .soul-Datei herunter.
 */
function downloadBundle(bundle, soulName) {
  const json    = JSON.stringify(bundle, null, 2);
  const blob    = new Blob([json], { type: "application/json" });
  const url     = URL.createObjectURL(blob);
  const date    = new Date().toISOString().split("T")[0];
  const a       = document.createElement("a");
  a.href        = url;
  a.download    = `${(soulName || "soul").replace(/[^a-z0-9]/gi, "_")}_${date}.soul`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Verschlüsselt Soul + Vault mit einem bereits abgeleiteten CryptoKey.
 * Wird von SoulEncryptModal für Passkey- und Trezor-Pfad genutzt.
 * Das Bundle-Format ist identisch mit dem 12-Wörter-Pfad.
 *
 * @param {CryptoKey} cryptoKey   – AES-GCM-Encrypt-Key (aus useSoulPasskey / useTrezorKey)
 * @param {string}    soulMarkdown
 * @param {Array}     vaultFiles  – [{ name, buffer }]
 * @param {string}    [soulName]
 * @returns {Promise<boolean>}
 */
export async function encryptWithKey(cryptoKey, soulMarkdown, vaultFiles, soulName) {
  if (!cryptoKey) return false
  try {
    const encryptedFiles = []
    if (soulMarkdown) {
      encryptedFiles.push(await encryptFile(cryptoKey, 'sys.md', soulMarkdown))
    }
    for (const file of (vaultFiles ?? [])) {
      if (!file.name || file.buffer == null) continue
      if (file.name === 'sys.md') continue
      if (file.name.toLowerCase().endsWith('.md')) {
        const preview = new TextDecoder().decode(new Uint8Array(file.buffer).slice(0, 400))
        if (preview.includes('soul_id:')) continue
      }
      encryptedFiles.push(await encryptFile(cryptoKey, file.name, file.buffer))
    }
    downloadBundle(assembleBundle(encryptedFiles), soulName)
    return true
  } catch (e) {
    console.error('[encryptWithKey]', e)
    return false
  }
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSoulEncrypt() {
  const mnemonic      = ref([]);    // string[] — 12 BIP39-Wörter
  const isEncrypting  = ref(false);
  const encryptError  = ref(null);

  /** Neue Mnemonic generieren und in mnemonic.value speichern */
  function generateMnemonic() {
    mnemonic.value = generateMnemonicWords();
  }

  /**
   * Vault verschlüsseln + als .soul-Bundle downloaden.
   * Verschlüsselt die sys.md + alle Vault-Dateien (Texte, Bilder, .webm-Aufnahmen).
   * @param {string} soulMarkdown  - Inhalt der sys.md (Text)
   * @param {Array}  vaultFiles    - [{ name: string, buffer: ArrayBuffer }] aus useVault.readAllVaultFiles()
   * @param {string} [soulName]    - Anzeigename für den Dateinamen
   * @returns {Promise<boolean>}
   */
  async function encrypt(soulMarkdown, vaultFiles, soulName) {
    if (!mnemonic.value.length) {
      encryptError.value = "Keine Mnemonic generiert.";
      return false;
    }
    if (!crypto?.subtle) {
      encryptError.value = "Verschlüsselung erfordert HTTPS.";
      return false;
    }

    isEncrypting.value = true;
    encryptError.value = null;

    try {
      const key            = await deriveKey(mnemonic.value);
      const encryptedFiles = [];

      // sys.md immer zuerst (aus In-Memory-State, kanonische Version)
      if (soulMarkdown) {
        encryptedFiles.push(await encryptFile(key, "sys.md", soulMarkdown));
      }

      // Alle Vault-Dateien: Texte, Bilder, Audio/Video (.webm) – alles als binary
      for (const file of (vaultFiles ?? [])) {
        if (!file.name || file.buffer == null) continue;
        // sys.md aus dem Vault-Ordner überspringen – oben schon aus In-Memory hinzugefügt
        if (file.name === "sys.md") continue;
        // Andere .md-Dateien die soul_id: im Frontmatter haben sind Soul-Kopien → überspringen
        // (z.B. "Soul.Test.md" – selber Inhalt wie sys.md, nur anderer Dateiname)
        if (file.name.toLowerCase().endsWith(".md")) {
          const preview = new TextDecoder().decode(new Uint8Array(file.buffer).slice(0, 400));
          if (preview.includes("soul_id:")) continue;
        }
        encryptedFiles.push(await encryptFile(key, file.name, file.buffer));
      }

      const bundle = assembleBundle(encryptedFiles);
      downloadBundle(bundle, soulName);
      return true;
    } catch (e) {
      console.error("[useSoulEncrypt] encrypt error:", e);
      encryptError.value = "Fehler bei der Verschlüsselung.";
      return false;
    } finally {
      isEncrypting.value = false;
    }
  }

  return { mnemonic, isEncrypting, encryptError, generateMnemonic, encrypt };
}
