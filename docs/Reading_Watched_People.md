# 阅读宽度、发现页观看开关与人物头像

唯一交付入口仍为 https://stremio2.ethankw.workers.dev/ 。

## 行为

- 详情内容列最大 40rem，简介另有 68ch 上限、1.7 行高，窄屏自动缩小。采用相对尺寸以适应文字缩放。参考 [W3C Visual Presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) 关于避免过长文字行的说明；本次不是对整个应用宣称 WCAG AAA 合规。
- 发现页“隐藏已观看”首次打开时默认关闭。仅 `watched === true` 的卡片隐藏；未知状态保留。保持加载的原始数组、卡片节点、链接和原始索引。
- 隐藏先缩小淡出，再让其余卡片平移到新位置；恢复在原位置加入并平移其他卡片。快速切换取消旧动画；系统减少动态效果时直接应用可见性。隐藏内容不可聚焦。开关本身不改 URL、不重新请求目录、不写观看状态。
- 实际目录由上游分页加载，前端并非一次取得整个目录。若当前已加载项目全被隐藏，显示提示和按需“加载更多”；不为开关自动扫描全部目录。正常手动滚动仍保留分页能力。
- 演员、导演原有 chip 增加圆形照片，保留原始名字和链接。用户已确认使用 TMDB。图片仅装饰，姓名仍是无障碍名称；头像延迟加载，失败保留圆形人物占位。

## 身份与失败处理

`GET /api/bilingual/v1/people?type=movie&id=tt0133093&zh=zh-CN`（series 同样支持）沿用私有 Access、服务开关、凭证检查、严格参数验证、响应体和总超时上限。

服务器先用 IMDb 影片 ID 精确定位唯一 TMDB 电影/剧集，再获取该片演职员名单；不使用全局同名人物搜索。仅保留 cast 和 Director，最多 120 项。图片地址限制为 TMDB 固定域名和经过校验的 profile_path。客户端只给当前片内、当前角色、精确归一化姓名且唯一的人物配图。身份不明、重名或缺图均回退占位。剧集显示剧集级演职员，不猜测单集导演。

API 有独立、有大小限制的内存缓存（64 项/128 KiB）；浏览器照片名单缓存最多 64 部影片，切换身份不显示旧片照片。请求异常不影响原有详情和资源列表。照片来源为 [TMDB Credits API](https://developer.themoviedb.org/reference/movie-credits)，不冒充 IMDb 照片。

## 验证与回滚

新增行为测试覆盖动画隐藏/恢复/取消/减少动态效果、片内身份、角色隔离、重名、参数、开关、缺凭证、错误影片与图片地址。浏览器使用隔离的合成观看记录验证，不写真实账号记录；真实 TMDB 照片通过本项目现有安全凭证取得。

本轮发布前的固定入口正常 Worker 版本：`458ef5cb-eaa3-48d6-8a9d-823bce06564a`，源码 `3ed14f12f60110bbfd6732e3968424b0019a56d2`。必要时在项目内执行：

```sh
WRANGLER_SEND_METRICS=false pnpm exec wrangler rollback 458ef5cb-eaa3-48d6-8a9d-823bce06564a --config wrangler.personal.jsonc
```

回滚保持 stremio2 地址、Access 和现有 Secret，不删除或修改观看记录、插件和账户数据。具体发布 SHA、CI 与线上验收见本轮交付收据。
