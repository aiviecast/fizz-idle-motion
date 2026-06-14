// wasm-smoke.mjs — fizz-idle-motion の wasm が native と同じ idle 値を出すか検証。
// CI が `almide build src/bridge.almd --target wasm` の後に走らせる。
//
//   node test/wasm-smoke.mjs

import { readFileSync } from "node:fs";

const mod = await WebAssembly.compile(
  readFileSync(new URL("../build/idle.wasm", import.meta.url)),
);
const imports = {};
for (const i of WebAssembly.Module.imports(mod)) {
  (imports[i.module] ??= {})[i.name] = () => 0;
}
const { exports: ex } = await WebAssembly.instantiate(mod, imports);
try { ex._start(); } catch { /* proc_exit */ }

const near = (a, b) => Math.abs(a - b) < 1e-3;
let ok = true;
const check = (name, got, want) => {
  if (!near(got, want)) { console.error(`FAIL ${name}: ${got} != ${want}`); ok = false; }
};

// breath は 4 秒周期: breath(0)=0.5, breath(1)=1, breath(2)=0.5, breath(3)=0
check("breath(0)", ex.idle_breath(0), 0.5);
check("breath(1)", ex.idle_breath(1), 1.0);
check("breath(2)", ex.idle_breath(2), 0.5);
check("breath(3)", ex.idle_breath(3), 0.0);
// sway は t=0 で head_x=0
check("head_x(0)", ex.idle_head_x(0), 0.0);
// blink は 1 周期 (3.7s) のどこかで必ず立つ
const peak = Math.max(...Array.from({ length: 370 }, (_, i) => ex.idle_blink(i / 100)));
if (peak <= 0.5) { console.error(`FAIL blink peak ${peak} <= 0.5`); ok = false; }

if (ok) {
  console.log(`wasm OK — breath cycle + sway + blink (peak=${peak.toFixed(3)}) match native`);
} else {
  process.exit(1);
}
