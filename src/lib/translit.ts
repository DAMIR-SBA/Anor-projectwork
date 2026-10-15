// Uzbek Latin → Cyrillic transliteration (official 1995 alphabet mapping).
// Used to derive Uzbek Cyrillic UI strings and catalog content from Latin sources.

const APOSTROPHES = /[ʻʼ‘’`']/g;

const DIGRAPHS: Array<[string, string]> = [
  ["o'", "ў"],
  ["g'", "ғ"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["yo", "ё"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "е"],
];

const SINGLE: Record<string, string> = {
  a: "а", b: "б", d: "д", e: "е", f: "ф", g: "г", h: "ҳ", i: "и", j: "ж", k: "к",
  l: "л", m: "м", n: "н", o: "о", p: "п", q: "қ", r: "р", s: "с", t: "т", u: "у",
  v: "в", x: "х", y: "й", z: "з", c: "к", w: "в",
  "'": "ъ",
};

// "ts" → "ц" only applies to loanwords and is ambiguous in native words, so it
// is not in DIGRAPHS; content that needs "ц" should carry an explicit *Cyrl override.

function isUpper(ch: string) {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function isLetter(ch: string | undefined) {
  return !!ch && /[a-zA-Z]/.test(ch);
}

// Brand and product names stay in Latin script inside Cyrillic text.
const KEEP = new Set([
  "anor", "plus", "telegram", "google", "click", "payme", "uzcard", "humo", "visa", "mastercard",
  "gemini", "excel", "trade-in", "hamyon", "android", "iphone", "apple", "samsung", "xiaomi", "artel", "wi-fi",
]);

function keepLatin(word: string): boolean {
  const bare = word.replace(APOSTROPHES, "");
  // Acronyms (API, PIN, SMS, QR, FBO, UZS…) and curated brand names.
  return (bare.length >= 2 && bare === bare.toUpperCase() && /[A-Z]/.test(bare)) || KEEP.has(bare.toLowerCase());
}

/** Transliterate a single plain-text run (no ICU syntax). */
export function latinToCyrillic(input: string): string {
  return input.replace(/[A-Za-zʻʼ‘’`'][A-Za-zʻʼ‘’`'-]*/g, (word) => {
    if (keepLatin(word)) return word;
    // "ANOR’ni", "Telegram’da": keep the name, transliterate the Uzbek suffix.
    const m = word.match(/^(.{2,}?)[ʻʼ‘’`']([a-z]+)$/);
    if (m && keepLatin(m[1])) return `${m[1]}’${transliterateWord(m[2])}`;
    return transliterateWord(word);
  });
}

function transliterateWord(input: string): string {
  const src = input.replace(APOSTROPHES, "'");
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const pair = src.slice(i, i + 2);
    const lowerPair = pair.toLowerCase();
    const prev = src[i - 1];
    const wordStart = !isLetter(prev) && prev !== "'";

    // Word-initial "e" is "э" in Uzbek Cyrillic; "ye" → "е".
    if ((ch === "e" || ch === "E") && wordStart) {
      out += isUpper(ch) ? "Э" : "э";
      i += 1;
      continue;
    }

    const digraph = DIGRAPHS.find(([lat]) => lat === lowerPair);
    if (digraph) {
      // "Sh" and "SH" both become "Ш".
      out += isUpper(pair[0]) ? digraph[1].toUpperCase() : digraph[1];
      i += 2;
      continue;
    }

    const lower = ch.toLowerCase();
    const mapped = SINGLE[lower];
    if (mapped !== undefined) {
      // Apostrophe between letters = tutuq belgisi (ъ); elsewhere keep the quote.
      if (lower === "'" && !(isLetter(prev) && isLetter(src[i + 1]))) {
        out += "’";
      } else {
        out += isUpper(ch) ? mapped.toUpperCase() : mapped;
      }
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Transliterate an ICU MessageFormat string while preserving placeholders,
 * plural/select keywords and rich-text tags: `{count, plural, one {# ta} other {# ta}}`.
 */
export function transliterateIcu(message: string): string {
  let out = "";
  let i = 0;
  // Stack of brace contexts: "arg" = inside {name, type, ...} header; "text" = inside a sub-message.
  const stack: Array<"arg" | "text"> = [];
  let buffer = "";

  const flushText = () => {
    if (buffer) {
      out += latinToCyrillic(buffer);
      buffer = "";
    }
  };

  while (i < message.length) {
    const ch = message[i];
    const top = stack[stack.length - 1];
    const inArgHeader = top === "arg";

    if (ch === "<") {
      // Rich text tag like <b> or </link> — copy verbatim.
      const end = message.indexOf(">", i);
      if (end !== -1 && /^<\/?[a-zA-Z][\w-]*>$/.test(message.slice(i, end + 1))) {
        flushText();
        out += message.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }

    if (ch === "{") {
      if (inArgHeader) {
        // Opening a sub-message after a plural/select key.
        out += ch;
        stack.push("text");
      } else {
        flushText();
        out += ch;
        stack.push("arg");
      }
      i += 1;
      continue;
    }
    if (ch === "}") {
      flushText();
      out += ch;
      stack.pop();
      i += 1;
      continue;
    }
    if (inArgHeader) {
      out += ch;
    } else if (ch === "#" && stack.length > 0) {
      flushText();
      out += ch;
    } else {
      buffer += ch;
    }
    i += 1;
  }
  flushText();
  return out;
}
