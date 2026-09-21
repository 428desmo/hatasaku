# hatasaku

畑作ボードゲームの模擬プレイ。ルールは `hatasaku_rules_v0.4.md`。

初版の盤面はテキスト。同じ Mac でブラウザを N 窓開くと人間 N 人になる。

```bash
npm install
npm test
npm run eval
npm run serve -- --humans=1 --cpus=2 --mode=tutorial
```

`serve` のあと、表示された URL をブラウザで開く。`--humans=3 --cpus=0` なら窓を 3 つ開く。
