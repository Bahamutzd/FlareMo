# FlareMo 安卓 App

`apps/android` 是一个 Capacitor 安卓外壳：App 打开后直接加载你部署的 FlareMo 实例，登录、记录、搜索、录音和网页版完全一致，网页更新后 App 里也立即生效，不用重新安装。

App 在网页版之外补了这些：

- 系统返回键在页面里后退，退回到首页后再按才会退出 App。
- 附件、导出文件和分享图片会保存到手机的“下载”文件夹。
- 录音时弹出安卓的麦克风权限请求。
- 链接到其他网站时用系统浏览器打开。
- 打不开实例时显示一个可以重试的页面。
- 网页版里的“安装到主屏幕”和网页推送开关在 App 里隐藏（WebView 不支持网页推送）。

## 用 GitHub Actions 构建

构建在 `.github/workflows/android.yml` 里完成，不需要在本机安装安卓开发环境。

1. 在仓库的 **Settings → Secrets and variables → Actions → Variables** 新建变量 `FLAREMO_APP_URL`，值是你的实例地址，例如 `https://notes.example.com`（必须是 https）。
2. 打开 **Actions → android → Run workflow** 运行一次。
3. 运行结束后，在这次运行页面底部的 **Artifacts** 下载 `FlareMo-<版本>.apk`，传到手机上安装。

推送名为 `android-v*` 的 tag（例如 `android-v0.20.1`）时，APK 还会自动附加到对应的 GitHub Release。

## 签名

没有配置签名密钥时，APK 用一次性的调试密钥签名，可以正常安装使用，但下一次构建出的 APK 无法覆盖安装，需要先卸载（本机数据会清空，记录都在服务器上，不受影响）。

要让后续版本能直接覆盖安装，生成一个发布密钥并存进仓库 Secrets。在任意装有 JDK 的电脑上运行：

```bash
keytool -genkeypair -v -keystore flaremo-release.keystore -alias flaremo \
  -keyalg RSA -keysize 2048 -validity 10000
```

然后把文件转成 base64（PowerShell：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("flaremo-release.keystore"))`），在 **Settings → Secrets and variables → Actions → Secrets** 新建四个 Secret：

| Secret | 内容 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 上面得到的 base64 文本 |
| `ANDROID_KEYSTORE_PASSWORD` | 生成密钥时设的密钥库密码 |
| `ANDROID_KEY_ALIAS` | `flaremo`（与 `-alias` 一致） |
| `ANDROID_KEY_PASSWORD` | 密钥密码（没单独设置时与密钥库密码相同） |

密钥文件和密码请自己妥善备份：丢失后，已安装的 App 无法再升级，只能卸载重装。

## 版本号

App 的版本号跟随 `apps/android/package.json` 的 `version`，内部版本号由它换算（`0.20.1` → `20001`），发新版时随其他包一起升级即可。

## 本地开发

本机已装 Android Studio 和 JDK 21 时：

```bash
cd apps/android
FLAREMO_APP_URL=https://notes.example.com pnpm sync
npx cap open android
```

`pnpm sync` 会生成离线页、启动图和各尺寸图标（来自 `apps/web/public/brand`），再同步到 `android/` 工程。
