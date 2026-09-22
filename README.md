# hatasaku

畑作ボードゲームの模擬プレイ。ルールは `hatasaku_rules_v0.9.md`。ソフトウェア仕様は `hatasaku_software_spec_v0.9.md`。

初版の盤面はカードUI。同じ Mac でブラウザを N 窓開くと人間 N 人になる。テキストUIは `/text`。

```bash
npm install
npm test
npm run eval
npm run serve -- --humans=1 --cpus=2 --mode=basic
```

`serve` のあと、表示された URL をブラウザで開く。`--humans=3 --cpus=0` なら窓を 3 つ開く。

- `--mode=basic`（10ラウンド）または `--mode=advanced`（18ラウンド）。`tutorial` / `full` も同じ意味の別名。
- `--seasons=N` でシーズン数。省略時は人数と同じ（基本のマッチ）。1シーズンだけなら `--seasons=1`。
