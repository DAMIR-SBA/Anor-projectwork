// Deterministic flat product illustrations used for demo catalog imagery.
// /media/demo/<kind>-<hex>-<variant>.svg → SVG. Real uploads replace these in production.

type Palette = { c: string; d: string; l: string; ink: string };

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const m = (a: number, z: number) => Math.round(a + (z - a) * t);
  return `#${[m(r, target[0]), m(g, target[1]), m(b, target[2])].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function palette(hex: string): Palette {
  return { c: `#${hex}`, d: mix(hex, [0, 0, 0], 0.35), l: mix(hex, [255, 255, 255], 0.55), ink: "#1A1A1F" };
}

const G: Record<string, (p: Palette) => string> = {
  phone: ({ c, d, l }) =>
    `<rect x="205" y="110" width="190" height="370" rx="34" fill="${d}"/><rect x="215" y="122" width="170" height="346" rx="26" fill="#0f1020"/>` +
    `<rect x="223" y="132" width="154" height="326" rx="20" fill="url(#scr)"/><rect x="270" y="138" width="60" height="12" rx="6" fill="#0f1020"/>` +
    `<circle cx="300" cy="300" r="46" fill="${l}" opacity=".85"/><path d="M285 300l12 12 22-26" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`,
  laptop: ({ c, d, l }) =>
    `<rect x="150" y="150" width="300" height="200" rx="16" fill="${d}"/><rect x="164" y="164" width="272" height="172" rx="8" fill="url(#lscr)"/>` +
    `<path d="M110 360h380l-26 44H136z" fill="${c}"/><rect x="262" y="364" width="76" height="10" rx="5" fill="${d}"/>` +
    `<rect x="190" y="200" width="120" height="14" rx="7" fill="#fff" opacity=".7"/><rect x="190" y="226" width="200" height="10" rx="5" fill="#fff" opacity=".45"/><rect x="190" y="246" width="170" height="10" rx="5" fill="#fff" opacity=".45"/>` +
    `<defs><linearGradient id="lscr" x1="0" x2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`,
  tablet: ({ c, d, l }) =>
    `<rect x="170" y="130" width="260" height="340" rx="28" fill="${d}"/><rect x="184" y="146" width="232" height="308" rx="14" fill="${l}"/>` +
    `<circle cx="260" cy="250" r="40" fill="${c}"/><rect x="220" y="320" width="160" height="16" rx="8" fill="${c}" opacity=".6"/><rect x="220" y="348" width="110" height="16" rx="8" fill="${c}" opacity=".4"/>`,
  headphones: ({ c, d, l }) =>
    `<path d="M180 330v-40a120 120 0 0 1 240 0v40" fill="none" stroke="${d}" stroke-width="26" stroke-linecap="round"/>` +
    `<rect x="150" y="300" width="74" height="130" rx="34" fill="${c}"/><rect x="376" y="300" width="74" height="130" rx="34" fill="${c}"/>` +
    `<rect x="166" y="320" width="22" height="90" rx="11" fill="${l}" opacity=".7"/><rect x="412" y="320" width="22" height="90" rx="11" fill="${l}" opacity=".7"/>`,
  earbuds: ({ c, d, l }) =>
    `<rect x="190" y="240" width="220" height="170" rx="70" fill="${l}"/><rect x="190" y="240" width="220" height="70" rx="35" fill="${c}"/>` +
    `<circle cx="255" cy="200" r="34" fill="#fff"/><rect x="247" y="200" width="16" height="70" rx="8" fill="#fff"/><circle cx="345" cy="200" r="34" fill="#fff"/><rect x="337" y="200" width="16" height="70" rx="8" fill="#fff"/>` +
    `<circle cx="300" cy="352" r="8" fill="${d}"/>`,
  watch: ({ c, d, l }) =>
    `<rect x="250" y="110" width="100" height="120" rx="20" fill="${d}"/><rect x="250" y="370" width="100" height="120" rx="20" fill="${d}"/>` +
    `<rect x="205" y="200" width="190" height="200" rx="52" fill="#1d1d26"/><rect x="220" y="215" width="160" height="170" rx="40" fill="url(#ws)"/>` +
    `<rect x="398" y="270" width="14" height="50" rx="7" fill="${c}"/><text x="300" y="315" text-anchor="middle" font-family="Arial" font-weight="700" font-size="46" fill="#fff">10:09</text>` +
    `<defs><linearGradient id="ws" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${d}"/></linearGradient></defs>`,
  tv: ({ c, d, l }) =>
    `<rect x="100" y="140" width="400" height="250" rx="14" fill="#1d1d26"/><rect x="112" y="152" width="376" height="226" rx="6" fill="url(#tvs)"/>` +
    `<path d="M240 390l-30 70M360 390l30 70" stroke="${d}" stroke-width="14" stroke-linecap="round"/><circle cx="420" cy="210" r="40" fill="${l}" opacity=".5"/>` +
    `<path d="M112 330c80-60 150-10 220-60s110-20 156 10v98H112z" fill="${d}" opacity=".55"/>` +
    `<defs><linearGradient id="tvs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`,
  camera: ({ c, d, l }) =>
    `<rect x="140" y="200" width="320" height="210" rx="30" fill="${d}"/><rect x="190" y="170" width="90" height="44" rx="12" fill="${d}"/>` +
    `<circle cx="300" cy="305" r="84" fill="#1d1d26"/><circle cx="300" cy="305" r="62" fill="${c}"/><circle cx="300" cy="305" r="30" fill="#0f1020"/><circle cx="286" cy="290" r="10" fill="#fff" opacity=".6"/>` +
    `<circle cx="420" cy="235" r="12" fill="${l}"/>`,
  speaker: ({ c, d, l }) =>
    `<rect x="200" y="120" width="200" height="360" rx="40" fill="${d}"/><circle cx="300" cy="200" r="44" fill="#1d1d26"/><circle cx="300" cy="200" r="22" fill="${c}"/>` +
    `<circle cx="300" cy="360" r="78" fill="#1d1d26"/><circle cx="300" cy="360" r="46" fill="${c}"/><circle cx="300" cy="360" r="16" fill="${l}"/>`,
  fridge: ({ c, d, l }) =>
    `<rect x="185" y="90" width="230" height="420" rx="26" fill="${l}"/><rect x="185" y="90" width="230" height="150" rx="26" fill="${c}"/>` +
    `<rect x="185" y="226" width="230" height="20" fill="${d}" opacity=".35"/><rect x="380" y="130" width="12" height="70" rx="6" fill="#fff"/><rect x="380" y="280" width="12" height="110" rx="6" fill="${d}"/>`,
  washer: ({ c, d, l }) =>
    `<rect x="160" y="110" width="280" height="380" rx="30" fill="#f4f4f6"/><rect x="160" y="110" width="280" height="70" rx="30" fill="${l}"/>` +
    `<circle cx="210" cy="145" r="14" fill="${c}"/><rect x="250" y="138" width="90" height="14" rx="7" fill="${d}" opacity=".4"/>` +
    `<circle cx="300" cy="330" r="110" fill="${d}"/><circle cx="300" cy="330" r="86" fill="url(#ww)"/><path d="M225 350c40-30 90 30 150-10" stroke="#fff" stroke-width="10" fill="none" opacity=".6"/>` +
    `<defs><linearGradient id="ww" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`,
  vacuum: ({ c, d, l }) =>
    `<circle cx="300" cy="320" r="160" fill="${d}"/><circle cx="300" cy="320" r="140" fill="${c}"/><circle cx="300" cy="320" r="60" fill="${d}"/><circle cx="300" cy="320" r="28" fill="${l}"/>` +
    `<rect x="270" y="170" width="60" height="22" rx="11" fill="${l}"/>`,
  kettle: ({ c, d, l }) =>
    `<path d="M200 240h200l20 220H180z" fill="${c}"/><rect x="170" y="450" width="260" height="30" rx="12" fill="${d}"/>` +
    `<path d="M400 270c70 0 70 130 0 130" stroke="${d}" stroke-width="22" fill="none"/><path d="M200 260l-60-50" stroke="${c}" stroke-width="26" stroke-linecap="round"/>` +
    `<rect x="250" y="200" width="100" height="40" rx="14" fill="${d}"/><rect x="230" y="280" width="14" height="140" rx="7" fill="${l}" opacity=".7"/>`,
  blender: ({ c, d, l }) =>
    `<path d="M220 120h160l-20 230H240z" fill="${l}" opacity=".85"/><rect x="230" y="100" width="140" height="30" rx="10" fill="${d}"/>` +
    `<path d="M240 300h120" stroke="${c}" stroke-width="8"/><rect x="210" y="350" width="180" height="130" rx="24" fill="${c}"/><circle cx="300" cy="415" r="26" fill="${l}"/>`,
  tshirt: ({ c, d, l }) =>
    `<path d="M220 130l-110 60 40 80 50-24v230h200V246l50 24 40-80-110-60c-10 30-40 50-80 50s-70-20-80-50z" fill="${c}"/>` +
    `<path d="M220 130c10 30 40 50 80 50s70-20 80-50" fill="none" stroke="${d}" stroke-width="10"/><circle cx="300" cy="300" r="40" fill="${l}" opacity=".6"/>`,
  shirt: ({ c, d, l }) =>
    `<path d="M225 120l-105 55 30 260h70V250h160v185h70l30-260-105-55-75 60z" fill="${c}"/><path d="M225 120l75 60 75-60" fill="${l}"/>` +
    `<path d="M300 180v260" stroke="${d}" stroke-width="6"/>` +
    [210, 250, 290, 330, 370].map((y) => `<circle cx="300" cy="${y}" r="6" fill="${l}"/>`).join(""),
  dress: ({ c, d, l }) =>
    `<path d="M255 110h90l-10 70 30 50-20 30 95 220H160l95-220-20-30 30-50z" fill="${c}"/>` +
    `<path d="M245 260h110" stroke="${d}" stroke-width="12"/>` +
    [0, 1, 2, 3, 4].map((i) => `<path d="M${190 + i * 50} 430l25-50 25 50-25 50z" fill="${l}" opacity=".7"/>`).join(""),
  jacket: ({ c, d, l }) =>
    `<path d="M220 110l-100 60 20 290h80V280h160v180h80l20-290-100-60-80 40z" fill="${c}"/><path d="M220 110l80 40 80-40-20 60-60 30-60-30z" fill="${d}"/>` +
    `<path d="M300 150v310" stroke="${d}" stroke-width="10"/><rect x="200" y="320" width="50" height="14" rx="7" fill="${d}"/><rect x="350" y="320" width="50" height="14" rx="7" fill="${d}"/>`,
  sneaker: ({ c, d, l }) =>
    `<path d="M110 370c0-60 20-120 70-150l60 40c40-10 70 10 100 40l110 40c40 14 50 40 50 60v20H110z" fill="${c}"/>` +
    `<rect x="100" y="410" width="410" height="34" rx="17" fill="#fff" stroke="${d}" stroke-width="6"/>` +
    `<path d="M240 270l40 36M270 255l40 36M300 250l36 36" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M380 360c30 10 60 10 90 30" stroke="${l}" stroke-width="12" fill="none"/>`,
  bag: ({ c, d, l }) =>
    `<path d="M240 200v-30a60 60 0 0 1 120 0v30" fill="none" stroke="${d}" stroke-width="18"/>` +
    `<path d="M160 200h280l20 270H140z" fill="${c}"/><rect x="160" y="250" width="280" height="16" fill="${d}" opacity=".4"/><rect x="280" y="250" width="40" height="44" rx="8" fill="${l}"/>`,
  cap: ({ c, d, l }) =>
    // Do‘ppi — square skullcap with white "qalampir" (pepper) motifs.
    `<path d="M170 380V240c0-60 60-100 130-100s130 40 130 100v140z" fill="#14141a"/><rect x="160" y="370" width="280" height="40" rx="10" fill="${c}"/>` +
    [[230, 230], [370, 230], [230, 320], [370, 320], [300, 180], [300, 280]].map(([x, y]) => `<path d="M${x} ${y - 30}c26 10 30 50 0 64c-30-14-26-54 0-64z" fill="#fff"/><circle cx="${x}" cy="${y + 34}" r="5" fill="${l}"/>`).join(""),
  sofa: ({ c, d, l }) =>
    `<rect x="140" y="200" width="320" height="130" rx="34" fill="${d}"/><rect x="110" y="280" width="380" height="120" rx="34" fill="${c}"/>` +
    `<rect x="100" y="250" width="70" height="160" rx="30" fill="${d}"/><rect x="430" y="250" width="70" height="160" rx="30" fill="${d}"/>` +
    `<rect x="180" y="290" width="110" height="40" rx="16" fill="${l}"/><rect x="310" y="290" width="110" height="40" rx="16" fill="${l}"/><path d="M150 410v40M450 410v40" stroke="${d}" stroke-width="14" stroke-linecap="round"/>`,
  lamp: ({ c, d, l }) =>
    `<path d="M230 140h140l50 130H180z" fill="${c}"/><rect x="292" y="270" width="16" height="170" fill="${d}"/><ellipse cx="300" cy="455" rx="90" ry="22" fill="${d}"/>` +
    `<ellipse cx="300" cy="280" rx="120" ry="18" fill="${l}" opacity=".45"/>`,
  pan: ({ c, d, l }) =>
    `<ellipse cx="270" cy="320" rx="160" ry="120" fill="${d}"/><ellipse cx="270" cy="310" rx="140" ry="100" fill="#22222b"/><ellipse cx="240" cy="290" rx="60" ry="30" fill="#fff" opacity=".08"/>` +
    `<rect x="410" y="290" width="150" height="34" rx="17" fill="${c}"/>`,
  pillow: ({ c, d, l }) =>
    `<path d="M150 180c100 20 200 20 300 0c-20 80-20 160 0 240c-100-20-200-20-300 0c20-80 20-160 0-240z" fill="${c}"/>` +
    `<path d="M220 300h160M300 230v140" stroke="${l}" stroke-width="10" stroke-linecap="round" opacity=".7"/><circle cx="300" cy="300" r="34" fill="none" stroke="${d}" stroke-width="10"/>`,
  perfume: ({ c, d, l }) =>
    `<rect x="265" y="120" width="70" height="60" rx="10" fill="${d}"/><rect x="285" y="170" width="30" height="40" fill="${l}"/>` +
    `<rect x="190" y="200" width="220" height="270" rx="44" fill="url(#pf)"/><rect x="230" y="300" width="140" height="70" rx="12" fill="#fff" opacity=".75"/>` +
    `<defs><linearGradient id="pf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>`,
  cream: ({ c, d, l }) =>
    `<rect x="170" y="220" width="260" height="210" rx="36" fill="${l}"/><rect x="160" y="170" width="280" height="80" rx="26" fill="${c}"/>` +
    `<rect x="215" y="300" width="170" height="16" rx="8" fill="${d}" opacity=".5"/><rect x="245" y="330" width="110" height="12" rx="6" fill="${d}" opacity=".35"/>`,
  lipstick: ({ c, d, l }) =>
    `<rect x="240" y="300" width="120" height="180" rx="16" fill="#2a2a33"/><rect x="250" y="250" width="100" height="70" rx="8" fill="#c7a24a"/>` +
    `<path d="M260 250V170l80-50v130z" fill="${c}"/><path d="M262 172l76-48" stroke="${l}" stroke-width="6" opacity=".7"/>`,
  bear: ({ c, d, l }) =>
    `<circle cx="220" cy="170" r="44" fill="${c}"/><circle cx="380" cy="170" r="44" fill="${c}"/><circle cx="220" cy="170" r="22" fill="${l}"/><circle cx="380" cy="170" r="22" fill="${l}"/>` +
    `<circle cx="300" cy="230" r="100" fill="${c}"/><ellipse cx="300" cy="400" rx="120" ry="110" fill="${c}"/><ellipse cx="300" cy="270" rx="44" ry="34" fill="${l}"/>` +
    `<circle cx="265" cy="210" r="10" fill="#1a1a1f"/><circle cx="335" cy="210" r="10" fill="#1a1a1f"/><circle cx="300" cy="258" r="12" fill="#1a1a1f"/><ellipse cx="300" cy="410" rx="60" ry="56" fill="${l}"/>`,
  stroller: ({ c, d, l }) =>
    `<path d="M170 260a130 130 0 0 1 260 0z" fill="${c}"/><path d="M170 260h260l-30 110H200z" fill="${d}"/><path d="M430 260l50-110" stroke="${d}" stroke-width="14" stroke-linecap="round"/>` +
    `<circle cx="220" cy="430" r="40" fill="#22222b"/><circle cx="380" cy="430" r="40" fill="#22222b"/><circle cx="220" cy="430" r="14" fill="${l}"/><circle cx="380" cy="430" r="14" fill="${l}"/>`,
  blocks: ({ c, d, l }) =>
    `<rect x="160" y="300" width="140" height="140" rx="14" fill="${c}"/><rect x="300" y="300" width="140" height="140" rx="14" fill="${d}"/><rect x="230" y="160" width="140" height="140" rx="14" fill="${l}"/>` +
    [[205, 300], [255, 300], [345, 300], [395, 300], [275, 160], [325, 160]].map(([x, y]) => `<rect x="${x - 18}" y="${y - 22}" width="36" height="22" rx="6" fill="${c}" opacity=".9"/>`).join(""),
  ball: ({ c, d, l }) =>
    `<circle cx="300" cy="300" r="150" fill="#fff" stroke="#1a1a1f" stroke-width="6"/><path d="M300 230l60 44-23 70h-74l-23-70z" fill="#1a1a1f"/>` +
    `<path d="M300 150v80M360 274l80-20M337 344l40 70M263 344l-40 70M240 274l-80-20" stroke="#1a1a1f" stroke-width="8"/><circle cx="300" cy="300" r="150" fill="none" stroke="${c}" stroke-width="14" opacity=".5"/>`,
  dumbbell: ({ c, d, l }) =>
    `<rect x="190" y="285" width="220" height="30" rx="15" fill="#9a9aa6"/><rect x="130" y="210" width="50" height="180" rx="14" fill="${c}"/><rect x="180" y="235" width="34" height="130" rx="12" fill="${d}"/>` +
    `<rect x="420" y="210" width="50" height="180" rx="14" fill="${c}"/><rect x="386" y="235" width="34" height="130" rx="12" fill="${d}"/>`,
  bike: ({ c, d, l }) =>
    `<circle cx="180" cy="380" r="90" fill="none" stroke="#22222b" stroke-width="16"/><circle cx="420" cy="380" r="90" fill="none" stroke="#22222b" stroke-width="16"/>` +
    `<path d="M180 380l80-140h120l40 140M260 240l60 140h-140M320 240l-20-50h-40M380 240l20-60h50" fill="none" stroke="${c}" stroke-width="16" stroke-linejoin="round" stroke-linecap="round"/>`,
  mat: ({ c, d, l }) =>
    `<rect x="120" y="260" width="300" height="160" rx="20" fill="${c}"/><circle cx="420" cy="340" r="80" fill="${d}"/><circle cx="420" cy="340" r="50" fill="${c}"/><circle cx="420" cy="340" r="20" fill="${l}"/>`,
  book: ({ c, d, l }) =>
    `<rect x="180" y="110" width="250" height="370" rx="14" fill="${c}"/><rect x="170" y="110" width="30" height="370" rx="8" fill="${d}"/><rect x="200" y="455" width="230" height="16" fill="#fff"/>` +
    `<rect x="230" y="170" width="160" height="16" rx="8" fill="${l}"/><rect x="230" y="200" width="120" height="12" rx="6" fill="${l}" opacity=".7"/><circle cx="310" cy="330" r="50" fill="${l}" opacity=".5"/>`,
  tea: ({ c, d, l }) =>
    // Choynak + piyola in a pattern reminiscent of Uzbek cotton motif.
    `<path d="M200 260h200c0 120-40 200-100 200s-100-80-100-200z" fill="#1d4e9e"/><path d="M400 300c60-10 70 60 10 80" stroke="#1d4e9e" stroke-width="18" fill="none"/>` +
    `<path d="M200 300l-60-40" stroke="#1d4e9e" stroke-width="22" stroke-linecap="round"/><rect x="270" y="225" width="60" height="40" rx="12" fill="#1d4e9e"/>` +
    [[260, 330], [300, 380], [340, 330]].map(([x, y]) => `<path d="M${x} ${y - 22}c14 10 14 34 0 44c-14-10-14-34 0-44z" fill="#fff"/>`).join("") +
    `<path d="M180 470h240" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`,
  jar: ({ c, d, l }) =>
    `<rect x="210" y="150" width="180" height="50" rx="12" fill="${d}"/><path d="M200 200h200c20 0 30 20 30 40v190c0 24-20 40-40 40H210c-20 0-40-16-40-40V240c0-20 10-40 30-40z" fill="${c}"/>` +
    `<rect x="210" y="280" width="180" height="100" rx="14" fill="#fff" opacity=".85"/><path d="M240 330h120" stroke="${d}" stroke-width="12" stroke-linecap="round"/><ellipse cx="250" cy="250" rx="16" ry="30" fill="#fff" opacity=".35"/>`,
  nuts: ({ c, d, l }) =>
    `<path d="M150 300c0 110 70 170 150 170s150-60 150-170z" fill="#8a5a2b"/><ellipse cx="300" cy="300" rx="150" ry="36" fill="#a8743f"/>` +
    [[230, 280], [280, 270], [330, 280], [370, 290], [255, 300], [310, 300]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="22" ry="16" fill="${c}"/><ellipse cx="${x - 5}" cy="${y - 4}" rx="7" ry="4" fill="${l}"/>`).join(""),
  plate: ({ c, d, l }) =>
    // Rishton lagan: cobalt and turquoise concentric ornament.
    `<circle cx="300" cy="300" r="190" fill="#f5f0e6"/><circle cx="300" cy="300" r="176" fill="none" stroke="#1d4e9e" stroke-width="14"/><circle cx="300" cy="300" r="150" fill="none" stroke="${c}" stroke-width="8" stroke-dasharray="20 14"/>` +
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      const x = 300 + Math.cos(a) * 95;
      const y = 300 + Math.sin(a) * 95;
      return `<path d="M${x} ${y - 26}c18 10 18 42 0 52c-18-10-18-42 0-52z" fill="#1d4e9e" transform="rotate(${(i * 45 + 90) % 360} ${x} ${y})"/>`;
    }).join("") +
    `<circle cx="300" cy="300" r="46" fill="${c}"/><circle cx="300" cy="300" r="22" fill="#f5f0e6"/>`,
  bowl: ({ c, d, l }) =>
    `<path d="M140 260h320c0 110-70 190-160 190s-160-80-160-190z" fill="#f5f0e6"/><path d="M140 260h320" stroke="#1d4e9e" stroke-width="14" stroke-linecap="round"/>` +
    `<path d="M175 320c40 20 80-20 125 0s85 20 125 0" stroke="${c}" stroke-width="12" fill="none"/>` +
    [210, 260, 340, 390].map((x) => `<circle cx="${x}" cy="370" r="10" fill="#1d4e9e"/>`).join(""),
  atlas: ({ c, d, l }) =>
    // Abr (ikat) silk — blurred zigzag diamonds.
    `<rect x="130" y="110" width="340" height="380" rx="18" fill="${c}"/>` +
    [0, 1, 2, 3].map((r) => [0, 1, 2].map((k) => {
      const x = 185 + k * 115;
      const y = 148 + r * 84;
      return `<path d="M${x} ${y}l45 40-45 40-45-40z" fill="${l}"/><path d="M${x} ${y + 18}l24 22-24 22-24-22z" fill="#F5B301"/>`;
    }).join("")).join("") +
    `<rect x="130" y="110" width="340" height="380" rx="18" fill="none" stroke="${d}" stroke-width="10"/>`,
  suzani: ({ c, d, l }) =>
    `<rect x="110" y="110" width="380" height="380" rx="12" fill="#f3ead8"/><rect x="130" y="130" width="340" height="340" fill="none" stroke="${c}" stroke-width="10" stroke-dasharray="26 12"/>` +
    [[300, 300, 90], [180, 180, 40], [420, 180, 40], [180, 420, 40], [420, 420, 40]].map(([x, y, r]) =>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="#f3ead8"/><circle cx="${x}" cy="${y}" r="${r * 0.36}" fill="${d}"/>` +
      Array.from({ length: 8 }, (_, i) => `<circle cx="${x + Math.cos((i * Math.PI) / 4) * r * 1.2}" cy="${y + Math.sin((i * Math.PI) / 4) * r * 1.2}" r="${r * 0.14}" fill="#2f6b3a"/>`).join(""),
    ).join(""),
  knife: ({ c, d, l }) =>
    // Chust pichoq: curved blade, ornamented handle.
    `<path d="M120 330c120-90 260-110 330-90l10 40c-120-10-230 30-340 50z" fill="#d7dbe2"/><path d="M130 326c110-70 240-92 320-84" stroke="#fff" stroke-width="6" opacity=".7"/>` +
    `<rect x="440" y="250" width="40" height="60" rx="6" fill="#c7a24a"/><path d="M470 255l90-20 10 50-90 30z" fill="${c}"/>` +
    [500, 525, 548].map((x) => `<circle cx="${x}" cy="${268 + (x - 500) * -0.2}" r="6" fill="#c7a24a"/>`).join(""),
  carpet: ({ c, d, l }) =>
    `<rect x="120" y="110" width="360" height="380" rx="8" fill="${c}"/><rect x="150" y="140" width="300" height="320" fill="${d}"/><rect x="175" y="165" width="250" height="270" fill="${c}"/>` +
    [0, 1, 2].map((r) => [0, 1].map((k) => `<path d="M${245 + k * 110} ${200 + r * 90}l30 30-30 30-30-30z" fill="#f3ead8"/><circle cx="${245 + k * 110}" cy="${230 + r * 90}" r="8" fill="${d}"/>`).join("")).join("") +
    Array.from({ length: 12 }, (_, i) => `<path d="M${130 + i * 30} 490v24M${130 + i * 30} 86v24" stroke="#f3ead8" stroke-width="5"/>`).join(""),
  tire: ({ c, d, l }) =>
    `<circle cx="300" cy="300" r="180" fill="#22222b"/><circle cx="300" cy="300" r="110" fill="#9a9aa6"/><circle cx="300" cy="300" r="40" fill="${c}"/>` +
    Array.from({ length: 5 }, (_, i) => `<rect x="294" y="196" width="12" height="70" rx="6" fill="#d7dbe2" transform="rotate(${i * 72} 300 300)"/>`).join("") +
    Array.from({ length: 24 }, (_, i) => `<rect x="296" y="122" width="8" height="28" fill="#3a3a46" transform="rotate(${i * 15} 300 300)"/>`).join(""),
  holder: ({ c, d, l }) =>
    `<rect x="230" y="130" width="140" height="250" rx="22" fill="#1d1d26"/><rect x="242" y="146" width="116" height="214" rx="12" fill="${l}"/>` +
    `<path d="M210 220v120M390 220v120" stroke="${c}" stroke-width="18" stroke-linecap="round"/><path d="M300 380v70" stroke="${d}" stroke-width="20"/><circle cx="300" cy="460" r="36" fill="${c}"/>`,
  gift: ({ c, d, l }) =>
    `<rect x="160" y="250" width="280" height="220" rx="16" fill="${c}"/><rect x="140" y="200" width="320" height="70" rx="16" fill="${d}"/>` +
    `<rect x="285" y="200" width="30" height="270" fill="#F5B301"/><path d="M300 200c-40-80-120-40-60 0M300 200c40-80 120-40 60 0" stroke="#F5B301" stroke-width="18" fill="none" stroke-linecap="round"/>`,
};

export const ART_KINDS = Object.keys(G);

/** SVG string for kind + base color (hex without #) + variant index (shifts the backdrop). */
export function productArtSvg(kind: string, hex: string, variant = 1): string {
  const glyph = G[kind] ?? G.gift;
  const safeHex = /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "C8102E";
  const p = palette(safeHex);
  const bg1 = mix(safeHex, [255, 255, 255], 0.9);
  const bg2 = mix(safeHex, [255, 255, 255], 0.78);
  const angle = (variant * 47) % 360;
  const blobX = 120 + ((variant * 97) % 360);
  const blobY = 100 + ((variant * 61) % 120);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">` +
    `<defs><linearGradient id="bg" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>` +
    `<radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="600" height="600" fill="url(#bg)"/>` +
    `<circle cx="${blobX}" cy="${blobY}" r="90" fill="#fff" opacity=".45"/><circle cx="${600 - blobX / 2}" cy="${520 - blobY / 3}" r="60" fill="${p.l}" opacity=".35"/>` +
    `<ellipse cx="300" cy="520" rx="200" ry="26" fill="url(#sh)"/>` +
    `<g transform="translate(0 10)">${glyph(p)}</g></svg>`
  );
}

export function artUrl(kind: string, hex: string, variant = 1): string {
  return `/media/demo/${kind}-${hex.replace("#", "").toUpperCase()}-${variant}.svg`;
}
