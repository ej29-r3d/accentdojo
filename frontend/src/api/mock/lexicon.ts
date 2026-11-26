// Broad US IPA for every word in the mock phrase set plus a few common extras.
// Stress marks sit at the start of the stressed syllable; the tokenizer
// attaches them to the following sound.

export const LEXICON: Record<string, string> = {
  a: "ə", about: "əˈbaʊt", afraid: "əˈfreɪd", ages: "ˈeɪdʒɪz", allergic: "əˈlɝdʒɪk",
  an: "æn", and: "ænd", are: "ɑr", as: "æz", ask: "æsk",
  bag: "bæg", be: "bi", been: "bɪn", before: "bɪˈfɔr", bill: "bɪl", book: "bʊk",
  booking: "ˈbʊkɪŋ", breakfast: "ˈbrɛkfəst", breathe: "brið", buy: "baɪ", by: "baɪ",
  can: "kæn", cancelled: "ˈkænsəld", card: "kɑrd", caught: "kɔt", change: "tʃeɪndʒ",
  clarify: "ˈklɛrəfaɪ", connecting: "kəˈnɛktɪŋ", could: "kʊd",
  discount: "ˈdɪskaʊnt", do: "du", doctor: "ˈdɑktər", does: "dʌz", "doesn't": "ˈdʌzənt",
  earlier: "ˈɝliər", english: "ˈɪŋglɪʃ", evening: "ˈivnɪŋ", everyone: "ˈɛvriwʌn",
  feel: "fil", fit: "fɪt", fitting: "ˈfɪtɪŋ", flight: "flaɪt", for: "fɔr",
  friday: "ˈfraɪdeɪ", fries: "fraɪz", from: "frʌm",
  gets: "gɛts", gift: "gɪft", go: "goʊ", good: "gʊd",
  had: "hæd", have: "hæv", head: "hɛd", headache: "ˈhɛdeɪk", hello: "həˈloʊ",
  here: "hɪr", hi: "haɪ", honestly: "ˈɑnɪstli", how: "haʊ", hurts: "hɝts",
  i: "aɪ", "i'd": "aɪd", "i'll": "aɪl", "i'm": "aɪm", "i've": "aɪv", if: "ɪf",
  in: "ɪn", included: "ɪnˈkludɪd", is: "ɪz", it: "ɪt", "it's": "ɪts",
  just: "dʒʌst", know: "noʊ",
  last: "læst", leave: "liv", let: "lɛt", like: "laɪk", little: "ˈlɪtəl",
  living: "ˈlɪvɪŋ", looking: "ˈlʊkɪŋ", lovely: "ˈlʌvli",
  me: "mi", mean: "min", meaning: "ˈminɪŋ", meet: "mit", meeting: "ˈmitɪŋ",
  menu: "ˈmɛnju", monday: "ˈmʌndeɪ", morning: "ˈmɔrnɪŋ", move: "muv",
  much: "mʌtʃ", my: "maɪ",
  name: "neɪm", nearest: "ˈnɪrəst", need: "nid", nice: "naɪs", no: "noʊ", not: "nɑt",
  of: "ʌv", one: "wʌn", our: "aʊər",
  pain: "peɪn", pay: "peɪ", peanuts: "ˈpinʌts", penicillin: "ˌpɛnəˈsɪlɪn",
  pharmacy: "ˈfɑrməsi", please: "pliz", possible: "ˈpɑsəbəl", prescription: "prɪˈskrɪpʃən",
  price: "praɪs", probably: "ˈprɑbəbli",
  quarterly: "ˈkwɔrtərli", question: "ˈkwɛstʃən",
  rather: "ˈræðər", recommend: "ˌrɛkəˈmɛnd", report: "rɪˈpɔrt", results: "rɪˈzʌlts",
  return: "rɪˈtɝn", revisit: "riˈvɪzɪt", room: "rum", rooms: "rumz",
  salad: "ˈsæləd", schedule: "ˈskɛdʒul", screen: "skrin", seat: "sit", see: "si",
  send: "sɛnd", share: "ʃɛr", should: "ʃʊd", sick: "sɪk", since: "sɪns", size: "saɪz",
  smaller: "ˈsmɔlər", something: "ˈsʌmθɪŋ", sore: "sɔr", speak: "spik",
  station: "ˈsteɪʃən", stay: "steɪ", steak: "steɪk", swap: "swɑp",
  table: "ˈteɪbəl", taken: "ˈteɪkən", tell: "tɛl", thank: "θæŋk", thanks: "θæŋks",
  that: "ðæt", the: "ðə", there: "ðɛr", think: "θɪŋk", this: "ðɪs", three: "θri",
  throat: "θroʊt", through: "θru", thursday: "ˈθɝzdeɪ", ticket: "ˈtɪkɪt", time: "taɪm",
  to: "tu", today: "təˈdeɪ", tomorrow: "təˈmɑroʊ", tonight: "təˈnaɪt",
  train: "treɪn", two: "tu",
  undercooked: "ˌʌndərˈkʊkt", up: "ʌp",
  very: "ˈvɛri",
  walk: "wɔk", want: "wɑnt", was: "wʌz", water: "ˈwɔtər", we: "wi", "we'd": "wid",
  weather: "ˈwɛðər", what: "wʌt", when: "wɛn", where: "wɛr", with: "wɪð",
  world: "wɝld", worse: "wɝs", would: "wʊd", wrap: "ræp",
  yes: "jɛs", you: "ju",
}

// Multi-character sounds, longest first.
const UNITS = ["tʃ", "dʒ", "eɪ", "aɪ", "aʊ", "ɔɪ", "oʊ"]
const STRESS = new Set(["ˈ", "ˌ"])

/** Split an IPA string into sounds; a stress mark stays glued to the next sound. */
export function tokenize(ipa: string): string[] {
  const out: string[] = []
  let pending = ""
  let i = 0
  while (i < ipa.length) {
    const ch = ipa[i]
    if (STRESS.has(ch)) {
      pending += ch
      i++
      continue
    }
    const unit = UNITS.find((u) => ipa.startsWith(u, i)) ?? ch
    out.push(pending + unit)
    pending = ""
    i += unit.length
  }
  return out
}

export const VOWELS = new Set(["i", "ɪ", "e", "ɛ", "æ", "ə", "ʌ", "ɑ", "ɔ", "o", "ʊ", "u", "ɝ", "eɪ", "aɪ", "aʊ", "ɔɪ", "oʊ"])

export function bare(sound: string): string {
  return sound.replace(/[ˈˌ]/g, "")
}

// Crude spelling-to-sound fallback for words typed by the user that are not in
// the lexicon. Good enough for the mock; the real backend uses a G2P model.
const SPELLING: [RegExp, string][] = [
  [/^tion/, "ʃən"], [/^th/, "θ"], [/^sh/, "ʃ"], [/^ch/, "tʃ"], [/^ph/, "f"], [/^ng/, "ŋ"],
  [/^ck/, "k"], [/^qu/, "kw"], [/^ee/, "i"], [/^ea/, "i"], [/^oo/, "u"], [/^ou/, "aʊ"],
  [/^ow/, "oʊ"], [/^ai/, "eɪ"], [/^ay/, "eɪ"], [/^oi/, "ɔɪ"], [/^igh/, "aɪ"],
  [/^a/, "æ"], [/^e/, "ɛ"], [/^i/, "ɪ"], [/^o/, "ɑ"], [/^u/, "ʌ"], [/^y$/, "i"], [/^y/, "j"],
  [/^c(?=[eiy])/, "s"], [/^c/, "k"], [/^x/, "ks"], [/^j/, "dʒ"], [/^r/, "r"],
  [/^([bdfghklmnprstvwz])\1/, "$1"],
]

export function guessIpa(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1)
  let out = ""
  while (w.length) {
    const rule = SPELLING.find(([re]) => re.test(w))
    if (rule) {
      const m = w.match(rule[0])!
      out += m[0].replace(rule[0], rule[1])
      w = w.slice(m[0].length)
    } else {
      out += w[0]
      w = w.slice(1)
    }
  }
  const sounds = tokenize(out)
  const firstVowel = sounds.findIndex((s) => VOWELS.has(s))
  if (sounds.filter((s) => VOWELS.has(s)).length > 1 && firstVowel >= 0) {
    const onset = firstVowel > 0 ? firstVowel - 1 : 0
    sounds[onset] = "ˈ" + sounds[onset]
  }
  return sounds.join("")
}

export function wordKey(text: string): string {
  return text.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, "")
}

export function phonemesFor(text: string): string[] {
  const key = wordKey(text)
  return tokenize(LEXICON[key] ?? guessIpa(key))
}
