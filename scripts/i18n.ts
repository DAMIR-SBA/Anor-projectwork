// i18n build: messages are authored per namespace in src/messages/{uz,ru}/<ns>.json.
//   tsx scripts/i18n.ts   → merges namespaces into src/messages/{uz,ru}.json,
//                           generates uz-Cyrl.json by transliterating uz (+ uz-Cyrl.overrides.json),
//                           and fails if uz/ru key sets differ or a key is defined differently in two files.
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

function leaves(t: Tree, prefix = ""): Array<[string, string]> {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
}

/** The same key defined differently in two namespace files: the later file would silently win. */
const collisions: string[] = [];

function build(locale: "uz" | "ru"): Tree {
  const files = readdirSync(`${dir}/${locale}`).filter((f) => f.endsWith(".json")).sort();
  let tree: Tree = {};
  const seen = new Map<string, { file: string; value: string }>();
  for (const f of files) {
    const part = JSON.parse(readFileSync(`${dir}/${locale}/${f}`, "utf8")) as Tree;
    for (const [k, v] of leaves(part)) {
      const prev = seen.get(k);
      if (prev && prev.value !== v) collisions.push(`${locale}: ${k} (${prev.file} vs ${f})`);
      seen.set(k, { file: f, value: v });
    }
    tree = merge(tree, part);
  }
  writeFileSync(`${dir}/${locale}.json`, JSON.stringify(tree, null, 2) + "\n");
  return tree;
}

const uz = build("uz");
const ru = build("ru");
let cyrl = mapTree(uz, transliterateIcu);
if (existsSync(`${dir}/uz-Cyrl.overrides.json`)) cyrl = merge(cyrl, JSON.parse(readFileSync(`${dir}/uz-Cyrl.overrides.json`, "utf8")));
writeFileSync(`${dir}/uz-Cyrl.json`, JSON.stringify(cyrl, null, 2) + "\n");

if (collisions.length) {
  console.error("Conflicting definitions:", collisions);
  process.exit(1);
}

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
