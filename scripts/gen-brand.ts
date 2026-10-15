import { writeFileSync, mkdirSync } from "fs";
import { lockupSvg, symbolSvg } from "../src/lib/brand-svg";
mkdirSync("public/brand", { recursive: true });
writeFileSync("src/app/icon.svg", symbolSvg({ size: 64 }));
writeFileSync("public/brand/anor-logo.svg", lockupSvg({ height: 64 }));
writeFileSync("public/brand/anor-logo-white.svg", lockupSvg({ height: 64, textColor: "#fff" }));
writeFileSync("public/brand/anor-symbol.svg", symbolSvg({ size: 512 }));
writeFileSync("public/brand/anor-maskable.svg", symbolSvg({ size: 512, background: "#FFFFFF", padding: 14 }));
console.log("ok");
