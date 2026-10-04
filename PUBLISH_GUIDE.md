# 先生のPCの起動を必要としない共有方法

このアプリは利用者自身のブラウザでカメラ映像を処理する静的サイトです。Google Cloud Run、Python、先生のPCの常時起動は不要です。

現在の `http://localhost:8791` は、このPCでの動作確認用です。localhostはURLを開いた人のPC自身を意味するため、そのURLを他人に送っても共有サイトにはなりません。

共有URLは https://daijirohaba.github.io/mediapipe-realtime-camera/ です。更新後もURLは同じです。配布者のPCがOFFでもGitHub Pagesから配信されます。利用者側はインターネットとカメラ、Chrome / Edgeだけで利用できます。

最新版は `shared_site_v1_2/` の静的サイト一式です。公開リポジトリは https://github.com/DaijiroHaba/mediapipe-realtime-camera 。公開作業コピー `github_pages_release/` の静的ファイルのみを `main` に反映します。旧 `shared_site_v1_1/` と旧ZIPは旧版として残し、新版と混同しないでください。

v1.2では全画面と3モードに対応します。姿勢ランドマークは最大4人、人流は人物検出モデルで最大20人、併用は両者の上限を別々に設定します。設定人数は検出保証ではありません。関心候補は連続3秒以上の立ち止まりを一時IDごとに計数した参考指標で、注視・関心そのものではありません。詳しくは公開版READMEを参照してください。

## GitHub Pagesに配置

1. GitHubで新しいリポジトリを作成します。例: `mediapipe-realtime-camera`。
2. ZIPを展開したフォルダの**中身**をリポジトリのトップへアップロードします。トップに `index.html` がある状態にします。ZIPそのものはアップロードしません。
3. `Settings` → `Pages` → `Build and deployment` で `Deploy from a branch`、ブランチ `main`、フォルダ `/ (root)` を選び、保存します。
4. 公開完了後に表示されるHTTPS URLを開きます。例: `https://<GitHubユーザー名>.github.io/mediapipe-realtime-camera/`。
5. 別PCで、モデル読込、カメラ開始、停止、録画OFF表示、短い録画保存を確認してから、そのHTTPS URLを共有します。

`.nojekyll` を含むので、アプリはビルドなしで配置できます。相対URLでWorker・モデル・WASMを読み込むため、リポジトリ名を含むURLでも利用できます。GitHub Pagesの利用条件・プランに従って公開してください。

## Netlifyに配置

1. Netlifyでログインし、手動デプロイ（Drag and drop / Deploy manually）を選びます。
2. `shared_site_v1_2/` を指定します。`index.html` が直接入っているフォルダを使います。
3. 発行されたHTTPS URLを別PCで確認して共有します。ビルドコマンドとサーバー起動は不要です。

同梱 `netlify.toml` は公開ルートとWASM・JavaScriptの配信形式、カメラの使用方針を指定します。料金・利用上限は公開先の管理画面で確認してください。

## 共有するファイル

共有用フォルダには以下を個別指定してコピーしています。

```text
index.html
style.css
app.js
core.mjs
recorder.mjs
pose-worker.js
README.md
PUBLISH_GUIDE.md
.nojekyll
netlify.toml
models/        モデルと由来の説明
vendor/        MediaPipe・WASM・Lucideアイコン・ライセンス
```

`audit/`、`review_v11/`、`test-output/`、`tests/`、録画、CSV、セッションJSON、`serve.mjs`、`start_app.cmd`、アカウント情報は含めていません。開発フォルダ全体ではなく、この共有用フォルダの中身を公開してください。

## 利用者への説明

- URLを開き、利用者本人のカメラをブラウザに許可して使います。先生のカメラ映像を受信する仕組みではありません。
- 動画・座標・一時IDを外部へ送信する処理はありません。静的ファイルの配信側には通常のサイトアクセスログが残り得ます。
- 映像録画は初期OFF。上部の赤い「録画していません」で確認できます。録画アイコンを押したときだけ記録し、保存アイコンで端末へ保存します。座標記録は別設定です。
- 脚が映らない場合は部分検出です。全身を見る場合はカメラを固定し、頭と両足を画面に入れてください。
- A/Bは通過計数線の両側で、人流または併用モードに表示します。

## 確認すること

実公開後に別PCから確認することで、先生のPCへの依存がないことを最終確認できます。今回の作業では、共有用フォルダをサブパスに置いた状態で、パッケージ内のファイルだけからモデル・WASMを読み込むことを確認しました。録画は同じソースでWebMを生成・再生して確認済みです。実際のHTTPSホスト上での確認は公開操作後に行ってください。

共有用ファイルは `shared_site_v1_2_manifest.json` のファイルリスト・SHA-256で照合できます。更新時は、新しいフォルダ名を指定して `node prepare-share.mjs shared_site_v1_2_1` と実行できます。現在の生成フォルダだけを更新する場合は `node prepare-share.mjs shared_site_v1_2 --refresh-generated`。未知のファイルが混入している場合は上書きせず停止します。

参考: [GitHub Pagesの仕組み](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[GitHub Pagesの作成手順](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)。
