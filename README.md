# hatasaku

畑作ボードゲームの模擬プレイ。ルールは `hatasaku_rules_v0.16.md`。ソフトウェア仕様は `hatasaku_software_spec_v0.16.md`。オンライン対戦は `hatasaku_online_play_spec_v0.4.md`。

## LAN（同じ Wi‑Fi）

同じ Mac でブラウザを N 窓開くと人間 N 人になる。テキストUIは `/text`。

```bash
npm install
npm test
npm run eval
npm run serve -- --humans=1 --cpus=2 --mode=basic
```

`serve` のあと、表示された URL をブラウザで開く。`--humans=3 --cpus=0` なら窓を 3 つ開く。

- `--mode=basic`（10ラウンド）または `--mode=advanced`（18ラウンド）。`tutorial` / `full` も同じ意味の別名。
- `--seasons=N` でシーズン数。省略時は人数と同じ（基本のマッチ）。1シーズンだけなら `--seasons=1`。

## オンライン（友人試験）

複数卓・ロビー・端末トークン・再接続。ログイン不要。

```bash
npm run serve:online -- --port=8080
```

表示された URL を開く（卓作成／参加コード）。LAN 単卓 UI は同じホストの `/lan`。

インターネット越しの試験は、常時起動できるマシン（例: Mac）で `serve:online` したうえで ngrok 等でポートを公開する。

```bash
ngrok http 8080
```

共有する URL は ngrok が出す `https://…`（パス不要。参加コードは画面または `?code=`）。  
プロセス再起動で進行中の卓は消える（メモリ上）。静的ホスト単体や ConoHa Wing の PHP 共用だけでは WebSocket ゲームホストには向かない。