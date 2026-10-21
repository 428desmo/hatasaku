# はたさく · Web Lite

既存版を残して作成した、人間1人＋CPUの軽量Web版。
既存 `src/engine` / `src/cpu` と一部の純粋な表示用関数を使用する。
ルールと数値を複製せず、画面とマッチ進行を新しくする。

- 公開：https://app1.gunsnstoneroses.com/hatasaku/
- ローカル：ルートで `npm ci` → `npm run serve:lite` → http://localhost:4173/
- ビルド：`npm run build:lite`（`web-lite/dist` を静的ホスティングへ配置）
- 型検査：`npm run check:lite`
- 新版テスト：`npm run test:lite`
- 既存版テスト：`npm test`
- VPS更新：`./conoha/update.sh`（詳細は `conoha/README.md`）

開発サーバーは起動時にビルド。変更後は再起動か `npm run build:lite` 後にブラウザを再読み込み。
独立したバックエンド、外部画像、フォント、オンライン対局は不要。
この初版はページ再読込で終了する。設定画面から学習ヒント切替・対局終了が可能。

仕様は `SPEC.md`。既存版の起動手順や実装はルートREADMEを参照。
