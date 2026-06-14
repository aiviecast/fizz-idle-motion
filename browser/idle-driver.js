// idle-driver.js — fizz-idle-motion の wasm をブラウザの requestAnimationFrame
// から駆動するグルー例。値の計算は Almide(wasm)、VRM への適用は Three.js(JS)。
//
//   import { startIdle } from "./idle-driver.js";
//   const stop = await startIdle("/idle.wasm", vrm);
//
// idle 値は壁時計秒 t = Date.now()/1000 の純関数なので、同じシーンを見る複数タブが
// ロックステップで瞬き/呼吸/微揺れする(状態を持たない)。

export async function startIdle(wasmUrl, vrm) {
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  const mod = await WebAssembly.compile(bytes);
  // fizz_idle_motion.wasm は WASI import を宣言する(DSP では使わない)。no-op スタブ。
  const imports = {};
  for (const i of WebAssembly.Module.imports(mod)) {
    (imports[i.module] ??= {})[i.name] = () => 0;
  }
  const { exports: ex } = await WebAssembly.instantiate(mod, imports);
  try { ex._start(); } catch { /* proc_exit */ }

  const humanoid = vrm.humanoid;
  const em = vrm.expressionManager;
  let raf = 0;

  const frame = () => {
    const t = Date.now() / 1000; // 壁時計同期
    const blink = ex.idle_blink(t);
    const breath = ex.idle_breath(t);
    const headX = ex.idle_head_x(t);
    const headY = ex.idle_head_y(t);
    const bodyZ = ex.idle_body_z(t);

    // ── 適用(I/O は JS / Three.js 側)──
    em?.setValue?.("blink", blink);
    em?.setValue?.("breath", breath);
    const chest = humanoid?.getNormalizedBoneNode?.("chest");
    if (chest) chest.rotation.x = (breath - 0.5) * 0.05;
    const head = humanoid?.getNormalizedBoneNode?.("head");
    if (head) { head.rotation.x = headX; head.rotation.y = headY; }
    const spine = humanoid?.getNormalizedBoneNode?.("spine");
    if (spine) spine.rotation.z = bodyZ;

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
