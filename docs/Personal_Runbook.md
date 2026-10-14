# Stremio Web Bilingual 使用与维护

这是个人 Stremio Web Fork，基线为 `v5.0.0-beta.42`。账号、片源、字幕和播放由原 Stremio 机制处理；双语接口只补充公开影视资料。

## 本地使用

在本项目工作区运行：

```sh
npx --yes pnpm@11.8.0 install --frozen-lockfile
npx --yes pnpm@11.8.0 verify:personal
npx --yes pnpm@11.8.0 dev:personal
```

本地地址为 `http://localhost:18433/`。播放对应片源时，保持现有 Stremio 本机服务在线。双语接口无需播放服务即可查询资料。

凭证仅放在 Git 忽略的 `.dev.vars`，权限为 0600。需要在新的工作区配置时，在自己的交互式 Terminal 中执行 `python3 scripts/set-local-tmdb.py`，隐藏输入 TMDB API Read Access Token。已有凭证文件会被拒绝覆盖。

## 显示设置

Settings → Interface 中的“影视资料双语显示 / Bilingual metadata”控制增强；可以选择标题和简介顺序，清除本功能的内存缓存。偏好只保存在当前域名和设备，不自动同步到其他设备或写入 Stremio 云端设置。

翻译缺失时显示明确提示，并保留原始文本。只有可靠 IMDb 身份和有语言/地区证据的字段才会补充；不会按片名猜电影，也不会把原语言标题当作英语翻译。

## 私人 HTTPS 入口

正式使用前先完成该项目的 Cloudflare Access 登录，再通过原 Stremio 页面登录账号。这两层登录独立。访问地址、发布提交和 Worker 版本以实际发布收据为准。

Access 失效时，资料层退回并提示重新进入私人入口。服务关闭或故障也会撤销已显示的旧结果；启动、恢复前台和前台每 30 秒会检查状态。页面、片源和原业务动作仍可使用。

## 验证边界

首页/目录卡片、Discover、搜索、片库和继续观看、电影与剧集详情、选中单集、单集列表及播放器侧栏均有接入。实际账号的片库/进度及移动端底部面板需要在相应真实环境中验收。

日历使用独立的 `CalendarContentItem` 展示入口，目前保留原文；未在真实数据中确认可靠父级身份，未从视频 ID 或链接推断。未经真实插件验证的 TMDB 标识格式、YouTube、直播等标识也保留原文。播放器顶栏和媒体会话保留原始标题。

本地内存缓存：客户端最多 512 条、512 KiB；Worker 最多 256 条、512 KiB。成功结果按来源获取时间保留最多 24 小时，确实未匹配最多 30 分钟。歧义与失败不进入长期缓存，部署代际变化会撤销旧结果。刷新、冷启动或重新打开页面可能重新查询。

## 发布与回滚

发布仅操作 `stremio-bilingual-preview` 和 `stremio-bilingual-personal`。从干净、已提交且通过 CI 的候选构建，部署时记录完整 SHA 与 Worker 版本；先关闭且无凭证部署，单 Worker Access 保护和匿名阻止验证后才设置 Secret、提交启用配置并重新构建部署。

继承的官方 Pages/Release/清理发布任务在本 Fork 中不执行。个人 CI 只做检查和部署 dry-run，没有自动云端发布或凭证。

回滚分别处理 Worker 版本、Git 源码、Access、Secret 和 PWA 缓存。关闭服务开关会让客户端退回；代码回滚不自动改变 Access 或轮换 Secret。最终收据会列出验证过的回滚版本与命令。保留账号、插件和观看进度存储，使用应用自带更新提示加载新版本。

继续开发时从个人稳定分支创建新分支；核查新的上游标签、差异和核心依赖后再升级，并重跑身份、资料、账号、播放、字幕及 PWA 验收。
