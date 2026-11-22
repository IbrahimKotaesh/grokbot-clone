// Renders the App Store screenshots (1320 x 2868) from template.html with headless Chrome.
// Run: node docs/app-store/screenshots/render.js [en/01]
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Colourful style: one bold gradient per slide, white headline, yellow accent words.
const slides = [
  { shot: "team", c1: "#ff8a1f", c2: "#ff3d6e", tilt: -4, px: 160,
    fruits: "watermelon:40:860:330:-12;orange:1000:1180:300:14;olive:30:2050:290:-8;fig:1010:2380:300:10",
    en: "Your AI team.|*Ready to work.*", ar: "فريقك الذكي.|*جاهز للعمل.*" },
  { shot: "chat", c1: "#7b5cff", c2: "#2f6bff", tilt: 4, px: 170,
    fruits: "orange:990:700:330:12;watermelon:-10:2560:290:-10",
    en: "Real work.|*Not just chat.*", ar: "عمل حقيقي.|*لا مجرد دردشة.*" },
  { shot: "market", c1: "#14c38e", c2: "#0a8f9c", tilt: -3, px: 160,
    fruits: "fig:20:720:310:-14;olive:1010:1560:290:12;orange:0:2580:280:-6",
    en: "Hire a bot.|*In one tap.*", ar: "وظّف بوتًا.|*بلمسة واحدة.*" },
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
