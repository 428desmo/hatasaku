# はたさく · Garden UX

「一手、ひと畑。」スマートフォン横向きの、人間1人＋CPUのカードゲーム。
既存 `src/engine` / `src/cpu` のルールを保ち、画面・進行・音を刷新しています。

- 公開：https://app1.gunsnstoneroses.com/hatasaku/
- ローカル：ルートで `npm ci` → `npm run serve:lite` → http://localhost:4173/
- ビルド：`npm run build:lite`（`web-lite/dist` を静的ホスティングへ配置）
- 型検査：`npm run check:lite`
- 新版テスト：`npm run test:lite`
- 既存版テスト：`npm test`
- VPS更新：`./conoha/update.sh`（`conoha/README.md`参照）

主な体験：14種のオリジナル野菜イラスト、手番と植え付けの演出、短い自動収穫、
後から読める収穫内訳、オリジナルのBGM・SE、自動保存・再開、戦略比較と表彰。
BGM／SEは個別にOFFにでき、演出速度・学習ヒント・収穫の手動進行も設定できます。
667×375、844×390、932×430の横画面を想定。小型端末の縦向きでは回転案内を表示します。

開発サーバーは起動時にビルド。変更後は `npm run build:lite` して再読み込み。
外部画像・音声・フォント・ゲームサーバーは不要。配信するのはHTML/JS/CSSの3ファイルです。

仕様・動作の詳細は `SPEC.md`。既存版の起動手順と実装はルートREADMEを参照。
