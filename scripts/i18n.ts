// i18n build: messages are authored per namespace in src/messages/{uz,ru}/<ns>.json.
//   tsx scripts/i18n.ts   → merges namespaces into src/messages/{uz,ru}.json,
//                           generates uz-Cyrl.json by transliterating uz (+ uz-Cyrl.overrides.json),
//                           and fails if uz/ru key sets differ.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { transliterateIcu } from "../src/lib/translit";

type Tree = { [k: string]: string | Tree };
const dir = "src/messages";

function mapTree(t: Tree, fn: (s: string) => string): Tree {
  const out: Tree = {};
  for (const [k, v] of Object.entries(t)) out[k] = typeof v === "string" ? fn(v) : mapTree(v, fn);
  return out;
}

function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = typeof v === "string" || typeof out[k] !== "object" ? v : merge(out[k] as Tree, v);
  }
  return out;
}

function keys(t: Tree, prefix = ""): string[] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));
}

function build(locale: "uz" | "ru"): Tree {
  const files = readdirSync(`${dir}/${locale}`).filter((f) => f.endsWith(".json")).sort();
  let tree: Tree = {};
  for (const f of files) tree = merge(tree, JSON.parse(readFileSync(`${dir}/${locale}/${f}`, "utf8")));
  writeFileSync(`${dir}/${locale}.json`, JSON.stringify(tree, null, 2) + "\n");
  return tree;
}

const uz = build("uz");
const ru = build("ru");
let cyrl = mapTree(uz, transliterateIcu);
if (existsSync(`${dir}/uz-Cyrl.overrides.json`)) cyrl = merge(cyrl, JSON.parse(readFileSync(`${dir}/uz-Cyrl.overrides.json`, "utf8")));
writeFileSync(`${dir}/uz-Cyrl.json`, JSON.stringify(cyrl, null, 2) + "\n");

const uzKeys = new Set(keys(uz));
const ruKeys = new Set(keys(ru));
const missingRu = [...uzKeys].filter((k) => !ruKeys.has(k));
const missingUz = [...ruKeys].filter((k) => !uzKeys.has(k));
if (missingRu.length || missingUz.length) {
  console.error("Missing in ru:", missingRu);
  console.error("Missing in uz:", missingUz);
  process.exit(1);
}
console.log(`i18n ok: ${uzKeys.size} keys × 3 locales`);
