# Hatasaku · ConoHa VPSへの公開

このプロジェクトでは `./conoha/update.sh` だけを使用する。
既存のQuota / Fragile / Loopを保持し、静的Web版を
https://app1.gunsnstoneroses.com/hatasaku/ に公開する。
ゲームサーバーやNodeの常駐プロセスは不要。

## 初回

1. `config.example.sh` を `config.sh` にコピー。SSHの鍵またはagentでVPSへ接続できることを確認する。パスワードや秘密鍵は記載しない。
2. リポジトリのルートで `npm ci`。
3. `./conoha/update.sh`。

更新時も同じコマンド。型チェック・新版のテスト・ビルドを実施し、`web-lite/dist` のHTML/JS/CSSの3ファイルだけを転送する。
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
