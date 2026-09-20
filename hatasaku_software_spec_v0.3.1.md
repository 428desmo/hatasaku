# 畑作 ソフトウェア仕様書 v0.3.1

作成日：2026-09-20  
規範：`hatasaku_rules_v0.3.1.md`（ルールの動きは v0.3 と同じ）  
対象：ローカルネット上のブラウザ対局と、コンピュータプレイヤーを含む模擬プレイ評価

この文書はルールの再定義ではない。ルールと食い違う場合は **ルール仕様書 v0.3.1 を正** とする。

---

## 1. 目的

1. 同じ LAN 上の PC・スマホのブラウザで、3〜5人の卓を進行できる。
2. 席の一部または全部をコンピュータプレイヤー（CPU）にできる。CPU は v0.1 の NPC ではなく、通常の席である。
3. ゲーム進行は決定的なエンジンに閉じ、人間 UI と CPU は同じ合法手 API を使う。
4. 卓ごとに評価ログを出し、ルール §14 の指標を集計できる。

### 非目標（初版）

- インターネット越しのマッチング、アカウント、永続ランキング
- 化学肥料・天候・多品種ボーナスなど、ルール §15 の未採用案
- 2人プレイ
- 高品質な演出・アニメーション（模擬プレイに足りる UI でよい）
- ルール未決の同点タイブレーク（共同勝者のまま）

---

## 2. 利用の流れ

1. 1台がホストになる。ホスト機でサーバを起動し、LAN 内 URL（例：`http://192.168.x.x:8080`）を表示する。
2. 各人間プレイヤーがその URL をブラウザで開く。席はホストが、人間または CPU として 3〜5 席を埋めてから開始する。
3. 開始時にゲームシードを確定する。同じシード・同じ行動列なら、盤面は再現できる。
4. 手番のプレイヤーだけが「植える／パス」を送る。他席は公開情報を見る。
5. 最終ラウンドの収入後、所持コイン最大の席が勝ち。同点は共同勝者。
6. 終了時に評価ログ（JSON）をホスト機に保存する。

人間0人・CPUのみのヘッドレス実行も、同じエンジンで可能であること。

---

## 3. 構成

```
[Browser]  --WebSocket-->  [Host]
[Browser]  --WebSocket-->    |- session / lobby
[CPU]      --in-process-->   |- game engine (pure)
                             |- rng (seeded)
                             |- evaluation log
```

- **エンジン**は純関数に近いモジュールとする。I/O・時計・乱数源を持たない。乱数はシード付き RNG を引数で渡す。
- **ホスト**だけが完全な `GameState` を持つ。クライアントには §10 の公開ビューだけを送る。
- **CPU** はホストプロセス内で、公開ビューを見て合法手を返す。山札の中身を読んではならない。
- 推奨実装言語は **TypeScript**（エンジンを単体テストしやすく、ホストとテストで共有できる）。UI はブラウザ。既存の Python シミュレータの戦略は、CPU モジュールへ移植してよい。

初版のプロセスモデルは「ホスト機で1プロセス」でよい。P2P や各クライアントでのルール再実行はしない（権威はホストのみ）。

---

## 4. データ

作物とイベントはコードに埋め込まず、データファイルから読む（ルール付録B）。

### 4.1 `data/crops.json`

```json
{
  "version": "0.3.1",
  "crops": [
    {
      "id": "radish",
      "name": "ラディッシュ",
      "cost": 1,
      "wait": 1,
      "harvest": 1,
      "baseIncome": 7,
      "floor": 3,
      "cooldown": 0,
      "copies": 10,
      "type": "immediate"
    }
  ]
}
```

`id` は安定した英単語。`name` は UI 表示。`type` は UI 用（`immediate` / `lump` / `long` / `mid`）で、ルール計算には使わない。

作物10種の数値はルール §12 どおり。イベントは各種に `+4, +2, -2, -4` を1枚ずつ自動生成する（データに書いてもよい）。

### 4.2 定数（ルールから固定）

| 定数 | 値 |
|---|---|
| 人数 | 3, 4, 5 |
| 農地スロット | 5（index 0..4。取得順） |
| 場札枚数 | 3人・4人は3、5人は4 |
| イベント列の最大 | 4 |
| イベント持続 | 左端になったラウンドを含めて3ラウンド |
| イベント累計上限 | チュートリアル10、本格20 |
| 初期コイン | 3人 `[8,9,9]`、4人 `[8,9,9,9]`、5人 `[8,8,9,9,9]`（席順の先頭から） |
| 農地取得コスト | `[0,1,2,3,4]`（すでに持っている枚数が n なら、次は `cost[n]`） |
| 同種減額 N | 1 |
| 1手番の行動 | 植える1回またはパス1回 |

---

## 5. ドメインモデル

識別子はすべて文字列または 0 始まりの整数で、ログにそのまま出す。

### 5.1 列挙

- `Mode`: `"tutorial"` | `"full"`
- `Phase`: `"lobby"` | `"eventUpdate"` | `"turn"` | `"income"` | `"gameOver"`
- `SeatKind`: `"human"` | `"cpu"`
- `CropId`: データファイルの `id`
- `SlotState`: `"unowned"` | `"waiting"` | `"harvesting"` | `"empty"`  
  `empty` は白=0 かつ 緑=0。赤や前作カードが残っていても `empty`。

### 5.2 カード

- `CropCard { instanceId, cropId }` — 40枚（4種×10）。`instanceId` は山札・場・農地・捨て札を追跡する。
- `EventCard { instanceId, cropId, delta }` — `delta` は 4 | 2 | -2 | -4。チュートリアルでは16枚中10枚だけが山札に入り、残り6枚は `excluded`（中身は非公開）。

### 5.3 農地スロット

```
Plot {
  index: 0..4
  owned: boolean
  cropCard: CropCard | null      // 前作または栽培中
  white: number
  green: number
  red: number
}
```

不変条件：

- `owned === false` ならカードもトークンもない。
- 白・緑・赤のうち、同時に正になるのは高々1種類。
- 待機中は `white > 0`、収穫中は `white === 0 && green > 0`、空きは `owned && white === 0 && green === 0`。

### 5.4 プレイヤー

```
Player {
  seat: 0..n-1
  kind: SeatKind
  name: string
  coins: number
  plots: Plot[5]
}
```

席 `0..n-1` は、準備で決めた **初期手番順** である。ラウンドごとの手番順は別配列 `turnOrder: seat[]` で持つ。

### 5.5 共有ゾーン

```
CropZones {
  deck: CropCard[]        // 先頭が次に引くカード。中身非公開、枚数公開
  discard: CropCard[]     // 表向き、公開
  market: CropCard[]      // 表向き。定員は場札枚数。足りなければ欠ける
}

EventZones {
  deck: EventCard[]
  discard: EventCard[]
  row: EventCard[]        // 左端が index 0。最大4、終盤は短い
  active: EventCard[]     // 最大2。公開
  excluded: EventCard[]   // チュートリアルの未使用6。ホストのみ保持
  drawnCount: number      // イベント列に出した累計。準備の4枚を含む
}

EventRuntime {
  // 左端になったラウンド。効果は activatedRound .. activatedRound+2
  activatedRound: Map<instanceId, number>
}
```

### 5.6 ゲーム状態（ホストのみ）

```
GameState {
  specVersion: "0.3.1"
  mode: Mode
  seed: string
  round: number            // 1始まり
  lastRound: 10 | 20
  phase: Phase
  actingSeat: number | null
  turnOrder: number[]
  players: Player[]
  crop: CropZones
  event: EventZones
  eventRuntime: EventRuntime
  winnerSeats: number[]    // gameOver 時
}
```

---

## 6. 乱数

ホストは開始時に `seed`（文字列または整数）を決める。エンジンは `rng.next()` だけを使う。

シャッフルが必要な操作は次に限る。

1. 10束から4束を選ぶ
2. 40枚の作物山札
3. 16枚のイベントを切り、チュートリアルなら上から10枚を山札、残りを `excluded`
4. 初期手番順（席の順列）
5. 作物捨て札を山札に戻すとき
6. 本格でイベント捨て札を山札に戻すとき

実装は Fisher–Yates。同じシードで同じ順になること。評価のため、開始ログに `seed` と選ばれた4作物を必ず書く。

---

## 7. 公開ビュー（クライアント・CPU に渡すもの）

ルール §10 に対応する。ホストの完全状態から投影する。

```
PublicView {
  mode, round, lastRound, phase, actingSeat, turnOrder
  players: [{
    seat, kind, name, coins
    plots: [{ index, owned, cropId, white, green, red }]
  }]
  market: [{ instanceId, cropId }]
  cropDeckCount, cropDiscard: [{ instanceId, cropId }]
  eventRow: [{ instanceId, cropId, delta, activatedRound? }]
  eventActive: [{ instanceId, cropId, delta, activatedRound }]
  eventDeckCount
  eventDiscard: [{ instanceId, cropId, delta }]
  drawnEventCount
  cropIdsInGame: CropId[]     // 準備で公開した4種
  legalActions?: Action[]     // actingSeat 本人にだけ付けてよい
}
```

送ってはならないもの：

- 作物山札・イベント山札の中身と順
- チュートリアルの `excluded` 6枚
- 他席の「これから出す手」

捨て札を山札に戻した瞬間、そのカードは `eventDiscard` / `cropDiscard` から消え、山札枚数だけが増える（ルール §8）。

`legalActions` を本人以外に送るかは実装任意。送る場合でも、CPU と人間の入力はホスト側で再検証する。

---

## 8. エンジン API

```
createGame(config: StartConfig, rng): GameState
  // lobby 確定後。準備§3をすべて行い、round=1, phase="turn",
  // actingSeat=turnOrder[0]。R1 はイベント更新しない。

listLegalActions(state): Action[]
  // phase==="turn" かつ actingSeat の手だけ。それ以外は空。

applyAction(state, action, rng): GameState
  // 非合法なら拒否（状態を変えない / 例外）。合法なら手番を進め、
  // 全員が終わっていれば収入→終了判定または次ラウンドのイベント更新へ。

getPublicView(state, viewerSeat | "spectator"): PublicView
```

`StartConfig`:

```
{
  mode: Mode
  seats: [{ kind, name, cpuStrategyId? }]  // length 3..5
  seed: string
}
```

エンジンは「イベント更新」「収入」をプレイヤー入力なしで連続適用してよい。ホストはそれらの直後にも `PublicView` を配る。

---

## 9. 行動

```
Action =
  | { type: "pass", seat }
  | { type: "plant", seat, marketIndex, target: "newLand" | { plotIndex } }
```

### 9.1 合法（ルール付録A）

`pass` は `phase==="turn"` かつ `seat === actingSeat` なら常に合法。

`plant` は次をすべて満たすとき合法。

- `seat === actingSeat` かつ場札に `marketIndex` がある
- `target === "newLand"` のとき：所持農地が4枚以下。コスト = 取得コスト（所持枚数）+ 栽培コスト。`coins >= コスト`。実際のスロットは **次の未取得枠**（最小の `owned===false` の index）
- `target.plotIndex` のとき：そのスロットは自分が所持し、空き（白=0かつ緑=0）。コスト = 栽培コスト。`coins >= コスト`。前作が同じ作物なら `red === 0`（C=0 なら空きになったラウンドから可）

負債なし。端数のない整数のみ。

### 9.2 植えの処理順（ルール §5）

1. コストを引く
2. 対象が空きスロットで前作があれば、そのカードを作物捨て札へ。赤があれば 0 にする
3. 場札のカードを対象スロットへ置く。`owned = true`
4. `white = W`, `green = 0`, `red = 0`
5. 作物山札の先頭を場札へ。山が空なら作物捨て札をシャッフルして山にする。それも空なら場札は欠けたまま

その後、`turnOrder` の次席へ。いなければ収入フェーズ。

---

## 10. 進行手順

### 10.1 準備（`createGame`）

1. 10作物から4種をランダムに選び、全員に公開
2. 各種10枚をシャッフルして作物山札。場札を定員まで表向き
3. 4種のイベント16枚をシャッフル  
   - チュートリアル：先頭10を山札、残り6を `excluded`  
   - 本格：16枚すべて山札
4. 山札から4枚をイベント列へ（左から右）。`drawnCount = 4`。左端の `activatedRound = 1`
5. 席順をランダムに並べ `turnOrder` とする。初期コインをその順で配る
6. `round = 1`, `phase = "turn"`, `actingSeat = turnOrder[0]`

### 10.2 イベント更新（2ラウンド目以降、手番の前）

ルール §4 の順をそのまま実装する。

1. `activatedRound + 2 < 今ラウンド` のカードを、発動中からイベント捨て札へ
2. 直前ラウンドの左端（更新前の `row[0]`）を発動中へ。列を左に詰める
3. 本格かつ山札が空かつ `drawnCount < 20` なら、イベント捨て札をシャッフルして山札にする
4. 山札があり、`drawnCount < 上限`（10または20）なら、1枚を右端へ。`drawnCount += 1`
5. 新しい左端の `activatedRound` が未設定なら今ラウンドを入れる。これが今ラウンドのイベント

有効イベント = 今の左端 ∪ 発動中。最大3枚。収入式の補正は、その作物についての `delta` 合計。

列の長さの目安：`min(4, lastRound - round + 1)`（チュートリアル R8–10 で 3→2→1、本格 R18–20 で 3→2→1）。

### 10.3 収入フェーズ

**開始時のスナップショット**で全農地の状態を見る。処理順は結果に影響しない。

1. 収穫中集合 = `white===0 && green>0` の農地
2. 各収穫中農地の収入  
   `max(floor, baseIncome - (同じ作物の収穫中数 - 1) + eventSum)`  
   自分の別農地は「他」に含む。自分自身は含めない。上限なし
3. 各プレイヤーの `coins` に加算（公開）
4. スナップショット時点の状態で、農地ごとに **1行だけ** トークンを進める

| 開始時 | 処理 |
|---|---|
| white > 0 | white -= 1。0 なら green = H |
| white==0 かつ green>0 | green -= 1。0 なら red = C（C=0 なら置かない） |
| green==0 かつ red>0 | red -= 1 |
| トークンなし | 何もしない |

緑を置いたフェーズでは収入なし。赤を置いたフェーズでは赤を減らさない。

最終ラウンドなら `phase="gameOver"`、`winnerSeats` = コイン最大の席（複数可）。  
否则 `round += 1`、手番順を「コイン昇順、同数は直前 `turnOrder` を維持」で決め、イベント更新へ。

手番順の実装：`turnOrder` を安定ソートする。比較キーは `coins` 昇順のみ。

---

## 11. ホストと通信

### 11.1 ロビー

- ホストがモード、席数、各席の kind、CPU 戦略、シード（空なら自動生成）を決める
- 人間はブラウザから席に入る。同じ席の二重接続は拒否（再接続は §11.3）
- 3〜5席が埋まり、ホストが開始したとき `createGame`

### 11.2 対局中メッセージ（論理）

クライアント → ホスト：

- `join { name }`
- `action Action`
- `ping`

ホスト → クライアント：

- `view PublicView`（状態が変わるたび、全員へ。`legalActions` は手番本人だけ）
- `error { code, message }`（非合法手など。状態は変わらない）
- `gameOver { winnerSeats, coins[] }`

トランスポートは WebSocket でよい。HTTP は静的 UI とヘルスチェック程度。

### 11.3 切断・制限時間（ルール未決）

初版のデフォルト：

- **制限時間なし**
- **切断**：卓は一時停止。再接続したら同じ席で再開。CPU への自動引き継ぎも自動パスもしない

運用で変えるならロビーのオプションとする（`pause` / `autoPass` / `replaceWithCpu`）。デフォルトを変えてもルール本文は変えない。評価用のヘッドレス卓では切断は起きない。

---

## 12. CPU プレイヤー

- 通常の席。人数・初期コイン・手番順の対象。
- 入力は `PublicView` と `legalActions` のみ。山札・excluded を読まない。
- 出力は `Action`。ホストは `applyAction` で再検証する。非合法を返したらホストは `pass` にフォールバックし、ログに `cpuIllegalFallback` を残す。
- 思考はホストのターン処理をブロックしてよい（初版）。人間の UI は「CPU 思考中」を出せればよい。

初版で載せる戦略（ルール §14 の評価と比較できるようにする）：

| id | 内容 |
|---|---|
| `random` | 合法手から一様乱択 |
| `irr` | 投資回収率ベース（既存 Python シミュレータの標準戦略を移植） |
| `irr_noise25` | 25% の手番で `random`、それ以外は `irr` |

戦略の追加は `cpuStrategyId` だけ増やし、エンジンは変えない。

---

## 13. UI（模擬プレイに必要な画面）

見た目より、公開情報と合法手が欠けないことを優先する。

1. **ロビー**：モード、席、人間/CPU、開始、LAN URL
2. **卓**：
   - ラウンド、フェーズ、手番順、今の手番
   - 自分と他者のコイン、5スロット（作物名、白/緑/赤、空き/未取得が区別できること）
   - 場札（購入ボタン）
   - 「新しい農地に植える」（コスト表示）
   - 空きスロットを指定して植える
   - パス
   - イベント列（左端が今）、発動中、それぞれの作物と ±
   - 山札枚数、捨て札（表）
   - 今ゲームの4作物
3. **結果**：コイン一覧、勝者（同点は複数）、ログ保存の有無
4. **スマホ**：手番操作（場札・パス・スロット）が親指で届くこと。ログの全文は二次的でよい

非合法なボタンは押せない（または押してもホストが拒否して盤面が動かない）。

ブラウザ検証の観点：植える、パス、他席の盤面更新、収入後のコインと手番順、最終結果が、ルール例と一致すること。

---

## 14. 評価ログ

1卓1ファイル（JSON）。最低限の形：

```json
{
  "specVersion": "0.3.1",
  "seed": "...",
  "mode": "tutorial",
  "crops": ["potato", "corn", "onion", "pumpkin"],
  "seats": [{ "seat": 0, "kind": "human", "name": "...", "strategy": null }],
  "actions": [
    { "round": 1, "seat": 0, "action": { "type": "plant", "marketIndex": 0, "target": "newLand" } }
  ],
  "income": [
    { "round": 1, "payouts": [0, 0, 0], "coinsAfter": [7, 9, 9] }
  ],
  "result": { "coins": [82, 90, 71], "winnerSeats": [1] },
  "metrics": {
    "passRate": 0.4,
    "cashShortTurns": 0.12,
    "sameCropPenaltyShare": 0.11,
    "actionsPerPlayer": 5.8,
    "cooldownBlocks": 0.14,
    "cropAdoption": { "potato": 0.5 }
  }
}
```

指標の定義はルール §14 に合わせる。ヘッドレスで N 卓回し、人数×モードの集計表を出せること。

---

## 15. 受け入れテスト

ルール付録Bに加え、エンジン単体で次を固定入力で通す。乱数はテストがシードと山札を直接組んでよい。

1. ジャガイモを R3 に植える → 収入は R5・R6 終了時。別作物は R7 から、ジャガイモは R11 から
2. カボチャの最後の収入が R8 終了時 → 別作物は R9 から、カボチャは R13 から
3. トウモロコシ基本10・保証4、同種の他が2 → イベントなし 8、+2 で 10、−4 で 4
4. イベント列 R1–R4：有効が A → A+B → A+B+C → B+C+D（AはR4開始で捨て）
5. 列の長さ：チュートリアル R8–10 で 3→2→1、本格 R18–20 で 3→2→1
6. 初期コイン：3人 8,9,9 / 4人 8,9,9,9 / 5人 8,8,9,9,9
7. 手番順：コイン昇順、同数は前ラウンド順を維持
8. パスは、植えられる手があっても合法
9. 空き（赤残り）に別作物は可、同種は `red>0` なら不可
10. 空きがあっても `newLand` は、上限未満かつ支払い可能なら可
11. 自分の収穫中が同種2なら、各農地の「他」は1（自己競合）
12. 植え替えは前作を捨ててから新カードを置く。赤は 0
13. 本格の `drawnCount` は 20 で打ち切り。再シャッフル後も 21 枚目は出さない
14. 作物山・捨てが空なら場札は欠けたまま。例外にしない

UI 結合は、最低でも「3席（人間1+CPU2）チュートリアルを最後まで終わらせ、結果画面とログが出る」こと。

---

## 16. 推奨ディレクトリ（初版）

```
data/crops.json
src/engine/          # 状態・合法手・進行。UI非依存
src/engine/engine.test.ts
src/cpu/             # 戦略。PublicView → Action
src/server/          # ロビー、WebSocket、ログ保存
src/web/             # ブラウザ UI
logs/                # gitignore
```

テストが通るエンジンを先に置き、そのあとホストと UI を足す。

---

## 17. 実装順

1. `data/crops.json` とエンジンの型
2. 受け入れテスト 1–14 が通るまでホストなしでエンジンを完成
3. CPU `random` / `irr` とヘッドレス評価ランナー
4. ローカルサーバとロビー、WebSocket で `PublicView` / `Action`
5. 卓 UI（場札、農地、イベント、パス）
6. LAN で 2 ブラウザ + CPU の通しプレイ
7. 評価ログと §14 指標の出力

---

## 18. ルール未決との境界

| 項目 | ソフトウェア初版 |
|---|---|
| タイトル | UI は「畑作（仮題）」 |
| 同点 | 共同勝者。タイブレークしない |
| 切断・制限時間 | 停止して再接続。タイマーなし |
| 公開情報モード切替 | §10 の初回規定のみ。捨て札非公開モードはフラグ予約でよいが、初期実装しなくてよい |
| 3人卓の同種減額 | ルールどおり。バランス変更はデータまたはルール改訂で行う |

---

## 19. 変更履歴

- 2026-09-20：ルール仕様書 v0.3.1 に対応する初版。
