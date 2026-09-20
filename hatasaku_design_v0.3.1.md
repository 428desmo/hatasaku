# 畑作 実装設計 v0.3.1

規範：`hatasaku_software_spec_v0.3.1.md`  
方針：エンジンと表示を分け、**最初の表示はテキスト**。グラフィックは同じ表示モデルの別レンダラとして後から足す。

---

## 1. 方針

```
           PublicView / Action
                  │
          BoardPresentation     ← 表示用の中間モデル。画素を持たない
             /          \
      TextRenderer    GraphicRenderer（未実装）
             │
    CLI と ブラウザ <pre>     後で Canvas / DOM
```

- ルール計算は `src/engine` だけが知る。DOM も WebSocket も持たない。
- 人間も CPU も `PublicView` を見て `Action` を返す。
- **テキストもグラフィックも、`BoardPresentation` を描くだけ**にする。初版はテキストレンダラだけを書く。
- ブラウザ初版は「等幅テキスト + 行動ボタン」。スマホでもテキストが読め、ボタンで手を出せればよい。
- 認証は持たない。接続 1 本 = 人間 1 席。

やらないこと（初版）：スプライト、アニメ、音、ログイン。

---

## 2. ランタイム

単一の Node プロセスがホストになる。

| 役割 | 実体 |
|---|---|
| エンジン | TypeScript、純関数に近い |
| ロビー / 卓 | 同プロセス。WebSocket でブラウザとつなぐ |
| CPU | 同プロセス。手番が CPU 席なら `PublicView` → `Action` |
| 人間 UI | ブラウザ。最初はテキスト描画 |
| 評価 | `npx tsx src/cli/eval.ts`。ブラウザなしで N=0 |

推奨スタック：

- TypeScript (strict)
- Node 20+
- Vitest（エンジンとテキスト描画のテスト）
- `ws`（WebSocket）
- ブラウザはバンドルした 1 HTML。React は初版では使わない（表示差し替えを簡単にするため）

のちのグラフィックは `src/view/graphic.ts` を足し、ブラウザ側のマウント先を `<pre>` から `<canvas>` に変える。エンジンとプロトコルは変えない。

---

## 3. ディレクトリ

```
data/crops.json              作物マスタ
src/engine/                  ルール。I/O なし
  types.ts
  catalog.ts                 crops.json を読む
  rng.ts
  legal.ts
  setup.ts
  turn.ts
  income.ts
  events.ts
  index.ts                   createGame / listLegalActions / applyAction / getPublicView
src/session/                 ロビー、接続→席、CPU 手番、ログ
  lobby.ts
  table.ts
  protocol.ts                WS メッセージ型
src/cpu/
  random.ts
  irr.ts
src/view/
  presentation.ts            PublicView → BoardPresentation
  text.ts                    BoardPresentation → string
  graphic.ts                 後で。同じ入力、Canvas へ描く
src/web/
  index.html
  main.ts                    WS クライアント。テキストを <pre> に出す
src/cli/
  eval.ts                    ヘッドレス評価
  print.ts                   1 卓をテキストで標準出力
logs/                        gitignore
```

テストは対象の隣に `*.test.ts` を置く。エンジンを先に赤テストで固める。

---

## 4. 表示モデル

`PublicView` はプロトコル用。UI は一度 `BoardPresentation` に変換してから描く。

```
BoardPresentation {
  title: string                 // 「チュートリアル  ラウンド 3/10」
  phaseLine: string             // 「手番 席1（あなた）」 / 「収入処理中」 / 「終了」
  eventRow: EventChip[]         // 左が今。current=true が左端
  eventActive: EventChip[]
  market: MarketChip[]          // index, 名前, コスト, 選択可か
  cropDeckCount: number
  eventDeckCount: number
  cropDiscardNames: string[]
  cropsInGame: string[]
  players: PlayerRow[]
  actions: ActionChip[]         // 自分の合法手。観戦・待ちなら空
  message: string | null        // 「CPU 思考中」「切断で停止」
}

PlayerRow {
  seat, name, kind, coins
  isYou, isActing
  plots: PlotChip[5]
}

PlotChip {
  index
  kind: "unowned" | "waiting" | "harvesting" | "empty"
  cropName: string | null
  previousName: string | null   // empty のとき前作
  white, green, red
}

EventChip { cropName, delta, current }
MarketChip { index, cropName, cost, enabled }
ActionChip { action: Action, label: string }   // 「パス」「場札2を新しい農地へ（3G）」
```

テキストレンダラはこの構造を文字列にする。グラフィックレンダラは同じチップをカードとトークンに置く。

チップの文言・合法判定はエンジンが出した `legalActions` にだけ従う。描画側でルールを再計算しない。

---

## 5. テキスト表示（初版の見た目）

等幅・日本語。例（席 0 の視点、手番中）：

```
畑作  チュートリアル  ラウンド 3/10
手番: 席0 あなた

イベント列: 〈トウモロコシ +4〉  ジャガイモ -2  ネギ +2  カボチャ -4
発動中:     ジャガイモ +2
4作物: ジャガイモ トウモロコシ ネギ カボチャ
場札:  [1]ラディッシュ 1G   [2]ネギ 2G   [3]カボチャ 3G
山札: 作物12  イベント5     捨て札: ラディッシュ

席0 あなた *  7G
  1:ジャガイモ 白2    2:空き 前ラディッシュ 赤3    3:未取得    4:未取得    5:未取得
席1 CPU     9G
  1:ネギ 緑3          2:未取得    3:未取得    4:未取得    5:未取得
席2 CPU     8G
  1:待機なし          ...

手:
  [P] パス
  [N] 場札2 ネギ を 新しい農地へ (取得1+栽培2=3G)
  [2] 場札1 ラディッシュ を 農地2へ (1G)
```

記号：

| 表示 | 意味 |
|---|---|
| `〈〉` | 今ラウンドのイベント（左端） |
| `白n` `緑n` `赤n` | 待機 / 収穫 / 連作CD |
| `空き 前X` | 白緑なし。前作カードあり。赤が残っていても空き |
| `未取得` | まだ自分の農地ではない |
| `*` | 今の手番 |

CLI（`print.ts` / 評価のデバッグ）もこの文字列を使う。ブラウザは `<pre id="board">` にそのまま入れる。

行動はキー入力でもボタンでも、同じ `Action` を送る。

- ブラウザ：`ActionChip.label` をボタンにする（スマホ向け）
- CLI：`P` / `N` / 数字はテスト用でよく、本番の人間対局はブラウザを使う

---

## 6. グラフィック（後で）

`src/view/graphic.ts` が `BoardPresentation` を受け取り、例えば次を描く。

- イベント列：左からカード 4 枚。左端を枠で強調
- 場札：横並びのカード。押せば `plant`
- 各席の 5 スロット：未取得は点線、空きは前作の薄いカード、栽培中は作物＋トークン色（白/緑/赤）
- 自分の手番だけボタンを有効化

レイアウト座標は graphic 側の関心。`BoardPresentation` に画素を足さない。テキスト用の文字列生成も graphic から呼ばない。

差し替え点は `src/web/main.ts` の 1 か所だけにする。

```
// 初版
mount(el, presentation) { el.querySelector("pre").textContent = renderText(presentation); }

// 後で
mount(el, presentation) { renderGraphic(el.querySelector("canvas"), presentation); }
```

ボタン行はどちらの表示でも `presentation.actions` から作る。

---

## 7. エンジン内部

`applyAction` 1 本が手番を進め、必要なら収入と次ラウンドのイベント更新まで続けて返す。UI はフェーズを待たない。

モジュールの役割：

| ファイル | 責任 |
|---|---|
| `catalog.ts` | 作物 ID → 数値。イベント 4 種の生成 |
| `rng.ts` | シード付き Mulberry32 + Fisher–Yates |
| `setup.ts` | 4 束、山札、初期コイン、`drawnCount=4` |
| `legal.ts` | 付録A。`listLegalActions` |
| `turn.ts` | 植えの処理順（前作を捨ててから置く）、パス、場札補充 |
| `events.ts` | §4 の 5 ステップ。有効イベント集合 |
| `income.ts` | 収穫スナップショット → 支払い → トークン 1 行 |
| `index.ts` | 上記の配線。`getPublicView` で山札中身を落とす |

状態はイミュータブルに近いコピーで返す（テストしやすさ優先。性能は 5 人 20 ラウンドでは問題にならない）。

CPU の `irr` は `listLegalActions` の各手を、公開情報だけで雑に評価する。山札は見ない。詳細はエンジンが通ってから詰める。

---

## 8. セッション

1 プロセスに卓は初版 1 つでよい（検証用）。

```
LobbyConfig { mode, humanCount, cpuCount, cpuStrategyId, seed? }

Table {
  config
  state: GameState | "lobby"
  connections: Map<WebSocket, seat>
  vacantHumanSeats: number[]    // 小さい順に渡す
}
```

接続時：空いている人間席の最小番号を割り当て、`assigned` と今の `view` を送る。  
切断時：その席を空きに戻す。対局中なら停止して `message` を出す。  
手番が CPU なら、ホストが `getPublicView` → CPU → `applyAction` を同期的に回し、各ステップで `view` を配る。

開始条件：人間接続数が `humanCount`。0 なら即開始可。

---

## 9. プロトコル（JSON）

クライアント → ホスト

```json
{ "type": "join", "name": "任意" }
{ "type": "action", "action": { "type": "pass" } }
{ "type": "action", "action": { "type": "plant", "marketIndex": 1, "target": "newLand" } }
{ "type": "action", "action": { "type": "plant", "marketIndex": 0, "target": { "plotIndex": 1 } } }
```

`seat` は送らない。ホストが接続から付ける。

ホスト → クライアント

```json
{ "type": "assigned", "seat": 0, "name": "プレイヤー1" }
{ "type": "lobby", "humanCount": 1, "cpuCount": 2, "connectedHumans": 1 }
{ "type": "view", "view": { "...PublicView" } }
{ "type": "error", "code": "illegal", "message": "..." }
{ "type": "gameOver", "winnerSeats": [1], "coins": [70, 91, 80] }
```

`PublicView.legalActions` は手番本人の接続にだけ入れる。

---

## 10. ブラウザ画面（初版）

1 ページ。領域は 3 つだけ。

1. **設定（ロビー）** — モード、N、M、開始、LAN URL。席選び UI は置かない
2. **盤面** — `<pre>` にテキスト
3. **手** — `actions` のボタン。手番でなければ「待ち」とだけ出す

CSS は等幅・十分なフォントサイズ・ボタンは 44px 以上。見た目の装飾は後のグラフィック担当。

同一 Mac で窓を N 個開く検証が、最初の結合テストになる。

---

## 11. テストの層

1. **エンジン**（ホストなし）：SPEC §15 の 1–14。固定シードと手作り状態の両方
2. **テキスト**：fixture の `PublicView` を渡し、空き／未取得／今イベントが文字列に出ること
3. **セッション**：仮想ソケットで N=2 接続 → 席 0 と 1 が違うこと。N=1,M=2 で開始できること
4. **手動**：ブラウザ 3 窓、および 1 窓 + CPU2

グラフィックを足すときは 2 の fixture を流用し、スナップショットは任意。

---

## 12. 実装順（この設計での作業単位）

1. `data/crops.json` と型（`engine/types.ts`, `view/presentation.ts`）
2. `view/text.ts` — fixture で文字列を固定。UI の見た目を先に決める
3. エンジンをテスト 1–14 が通るまで
4. `cpu/random` と `cli/eval.ts`（N=0）
5. `session` + `web` テキスト UI
6. ブラウザ N 窓で通し
7. （別マイルストーン）`view/graphic.ts`

1–2 はルール未実装でも進められる。テキストの列を先に固定すると、のちのグラフィックのチップ切り出しが楽になる。
