# fizz-idle-motion

Fizz の **idle モーション計算コア**。アバターの「生きてる感」を出す自動瞬き・呼吸・
微揺れの値を、壁時計の秒数 `t` から決定論的に計算する。

設計の肝: **全部 `t`(壁時計秒)の純関数**。同じシーンを見る 2 タブ(operator と
broadcaster)が dt の累積に依存せず**完全に同じ曲線**を描く(タブ間ロックステップ)。
lipsync と同じく DSP を Almide で 1 回書き、native と wasm の両バックエンドで使う:

```
          ┌──────────────────────────┐
wall t ─▶ │ fizz_idle_motion (純 Almide) │ ─▶ blink / breath / head_x,y / body_z
          └──────────────────────────┘
               ▲                    ▲
        native (Rust)        wasm (requestAnimationFrame)
   曲線の precompute/テスト    毎フレーム呼び VRM に適用
   (src/main.almd)            (browser/idle-driver.js)
```

VRM のボーン/表情への**適用(Three.js の I/O)は JS グルーが担当**し、数式はこの
Almide コアが担う。移植元: openaituber `src/vrm/idle.ts`。

## 数式

- **blink** `[0,1]` — 周期 3.7s。各周期の開始位置を決定論ハッシュで選ぶので、状態
  無しで「いま瞬き中か / どこまで進んだか」が `t` だけで決まる(タブ間一致)。
- **breath** `[0,1]` — 4 秒周期の正弦。expression "breath" と chest 回転に使う。
- **sway** — 頭/体の微揺れ(位相と周期をずらした微小正弦)。`head_x / head_y / body_z`。

## ① native — precompute / 確認

```sh
almide build src/main.almd -o build/fizz-idle-motion
FIZZ_IDLE_SECONDS=4 FIZZ_IDLE_FPS=30 ./build/fizz-idle-motion
# {"t":0,"blink":0,"breath":0.5,"head_x":0,...}
```

## ② wasm — requestAnimationFrame

```sh
almide build src/bridge.almd --target wasm -o build/idle.wasm
```

エクスポートは全て `(Float) -> Float`(RawPtr も buffer も不要、JS から number で
呼べる): `idle_blink` / `idle_breath` / `idle_head_x` / `idle_head_y` / `idle_body_z`。
ブラウザ側のグルー例は [`browser/idle-driver.js`](./browser/idle-driver.js):

```js
import { startIdle } from "./idle-driver.js";
const stop = await startIdle("/idle.wasm", vrm); // raf ループで毎フレーム適用
```

JS から書いた idle 値が native と一致することを CI(`test/wasm-smoke.mjs`)で検証。

## 開発

```sh
almide check src/main.almd
almide test spec/idle_motion_test.almd
almide build src/main.almd -o build/fizz-idle-motion
almide build src/bridge.almd --target wasm -o build/idle.wasm
```

ツールチェーン: [almide](https://github.com/almide/almide) v0.27.6+。依存なし。

## §6 (アバター系) のスコープ

§6 は Three.js/WebGL 依存が大きい(vrm-loader / scene-renderer / spring-bone 等は
ブラウザ専用)。そのうち **計算で表せる部分** を Almide 化したのがこの部品。同様に
gesture-player(ジェスチャ keyframe)/ camera-presets(tween)/ rig 正規化の
ボーン名マッピングなども計算コアは移植可能で、描画 I/O は TS に残す。
