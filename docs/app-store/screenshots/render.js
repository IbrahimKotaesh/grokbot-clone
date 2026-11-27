// Renders the App Store screenshots (1320 x 2868) from template.html with headless Chrome.
// Run: node docs/app-store/screenshots/render.js [en/01]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Colourful style: one bold gradient per slide, white headline, yellow accent words.
const slides = [
  { shot: "home", c1: "#ffb020", c2: "#ff5a36", tilt: -4, px: 160,
    fruits: "char-badr:30:900:330:-12;char-chef:1010:1250:270:12;char-architect:20:2120:270:-8;char-medic:1020:2420:260:10",
    en: "Your AI team.|*Ready to work.*", ar: "فريقك الذكي.|*جاهز للعمل.*" },
  { shot: "chat", c1: "#7b5cff", c2: "#2f6bff", tilt: 4, px: 170,
    fruits: "char-architect:1000:760:300:12;char-badr:-10:2520:280:-10",
    en: "Real work.|*Not just chat.*", ar: "عمل حقيقي.|*لا مجرد دردشة.*" },
  { shot: "team", c1: "#14c38e", c2: "#0a8f9c", tilt: -3, px: 160,
    fruits: "char-badr:20:760:300:-12;char-medic:1010:1580:270:12;char-engineer:0:2560:260:-6",
    en: "Badr leads.|*The team delivers.*", ar: "بدر يقود.|*والفريق يُنجز.*" },
  { shot: "market", c1: "#ff5c8a", c2: "#ff8a3d", tilt: 3, px: 170,
    fruits: "char-florist:1000:780:290:10;char-chef:-10:2480:270:-10",
    en: "Hire a teammate.|*In one tap.*", ar: "وظّف زميلًا.|*بلمسة واحدة.*" },
];

const only = process.argv[2];
for (const lang of ["en", "ar"]) {
  fs.mkdirSync(path.join(dir, lang), { recursive: true });
  slides.forEach((s, i) => {
    const n = String(i + 1).padStart(2, "0");
    if (only && only !== `${lang}/${n}`) return;
    const q = new URLSearchParams({ lang, style: "color", title: s[lang], shot: `raw/${s.shot}.png`,
      c1: s.c1, c2: s.c2, em: "#ffe58a", tilt: String(s.tilt), px: String(s.px), fruits: s.fruits });
    const out = path.join(dir, lang, `${n}.png`), before = Date.now();
    // Chrome sometimes exits with an error while shutting down after it has written the file.
    try {
      execFileSync(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
        "--window-size=1320,2868", "--virtual-time-budget=8000", `--screenshot=${out}`,
        `file://${dir}/template.html?${q}`], { stdio: "ignore" });
    } catch {}
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < before) throw Error("Chrome did not write " + out);
    console.log(out);
  });
}
