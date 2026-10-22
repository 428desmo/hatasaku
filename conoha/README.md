# Hatasaku · ConoHa VPSへの公開

このプロジェクトでは `./conoha/update.sh` だけを使用する。
既存のQuota / Fragile / Loopを保持し、静的Web版を
https://lab.tokyo-desmo.com/hatasaku/ に公開する。
ゲームサーバーやNodeの常駐プロセスは不要。

## 初回

1. `config.example.sh` を `config.sh` にコピー。SSHの鍵またはagentでVPSへ接続できることを確認する。パスワードや秘密鍵は記載しない。
2. リポジトリのルートで `npm ci`。
3. `./conoha/update.sh`。

更新時も同じコマンド。型チェック・新版のテスト・ビルドを実施し、`web-lite/dist` のHTML/JS/CSSとインデックス用SVG画像の4ファイルだけを転送する。
設定ファイル、ソースコード、ゲームルールは配信しない。

## VPS上の配置

- `/srv/hatasaku/web/releases/<日時>-<ID>/`：配信成果物
- `/srv/hatasaku/web/current`：現行releaseへのシンボリックリンク
- `/srv/hatasaku/backups/<日時>/`：変更前のNginx・共通インデックス・以前のreleaseパス
- `/etc/nginx/conf.d/quota.conf` と `quota-https.conf`：`BEGIN HATASAKU` の範囲だけを追加・更新
- `/srv/quota/web/current/portal/index.html`：既存カードと同じスタイルでHatasakuを追加

Nginxの構文検査・HTTPSでのHTML/JS/CSSとインデックス・既存ゲームの疎通確認を実施する。
失敗したら設定、インデックス、現行releaseを元に戻す。過去release/backupは自動削除しない。
手動で戻す場合はbackup内のファイルと `previous-release.txt` を参照。

共通インデックスはQuota側のrelease内にあるため、Quotaを再公開してリンクが消えた場合は
この `update.sh` を再実行する。ほかのプロジェクトの公開スクリプト自体は変更しない。

## 移植元の補助スクリプト

`init.sh` / `https.sh` / `cleanup.sh` / `setup-server.sh` /
`setup-https-server.sh` / `configure-index-server.sh` は移植元の旧手順だった。
Hatasakuでは既存VPSのNginx/TLSを再利用するため、誤実行防止の案内だけを返す。
`web_files.py` と `config.esh` は移植元の資料として残しているが、Hatasakuの公開では使わない。


## 共有ホスト名（2026-10-22）

主な入口は `https://lab.tokyo-desmo.com/`、VPSは `133.88.122.153`。
`quota-https.conf` のHTTP/HTTPS両serverに、新旧2つのホスト名を設定する。
HTTPはアクセスしたホスト名のHTTPSへパス・クエリを保って転送する。
`app1.gunsnstoneroses.com` もHTTPSで継続利用できる。ブラウザの保存対局はホスト名ごとに別なので、旧URLで保存した対局は旧URLで再開する。

移行は `./conoha/migrate-domain.sh`。nginx設定をバックアップし、既存のアプリ経路を変更せずserver_nameとHTTP転送だけを更新する。既存のLet's Encrypt証明書（cert-nameは旧ホスト名のまま）を両ホスト名へ拡張する。nginx検査・新旧ホストの全アプリ疎通・自動更新タイマーの稼働を確認し、失敗時はnginx設定を復元する。DNSのAレコードが両方ともVPSを指していることを事前検証する。

証明書の更新は既存の `certbot-renew.timer` / `certbot-renew.service` を使用。nginx認証で自動更新し、既存の `quota-reload-nginx.sh` deploy hookで構文検査・再読込する。移行後は `certbot renew --cert-name app1.gunsnstoneroses.com --dry-run` で更新を確認する。

## Hatasakuのパネル画像

配信先は `/hatasaku/hatasaku-cover.svg`。インデックスの管理対象パネルに `<img>` として埋め込み、縦横のカード枠に合わせてトリミングする。実際のスマホ版の上半分が画像領域を覆うほど拡大したプレイ画面を全面の背景にし、4枚の作物カードと「葉アイコン はたさく HATASAKU」を重ねた構成。SVGには画面のPNGを埋め込み、イラスト・文字・カードはベクターで描く。外部画像・フォント・スクリプトは読み込まない。

`node --import tsx conoha/artwork/build-cover.ts /path/to/gameplay.png` で作り直せる。入力は390×680の実プレイ画面。引数を省略すると既存SVG内の画面を再利用する。`web-lite/build.mjs` が画像をdistへコピーし、通常の `update.sh` で公開するため、今後の更新で画像が消えない。
