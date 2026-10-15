# TMDB 目录编号兼容修复

发现页第二个菜单汇总各插件的目录。The Movie Database Addon 的 [parseMedia](https://github.com/mrcanelas/tmdb-addon/blob/main/addon/utils/parseProps.js) 返回 `tmdb:${id}`，名称和海报使用插件所选语言；[getCatalogPreview](https://github.com/mrcanelas/tmdb-addon/blob/main/addon/lib/getCatalogPreview.js) 在可用且配置允许时也可返回 IMDb 编号。此前双语层只接受 IMDb 编号，导致 TMDB 原生目录回退成中文单行名称。

## 修复范围

- 客户端、Worker 参数校验和人物照片请求接受明确 `movie`/`series` 类型的 `tmdb:正整数`。
- 元数据直接查询对应 TMDB `/movie/{id}` 或 `/tv/{id}`，并核对响应 ID，继续使用有语言/地区证据的中英文标题和简介。电影与剧集同号不共享缓存。
- 单集沿用可靠父级编号和明确季/集数，先验证父剧集，再验证季/集身份；不从视频 ID 猜父级。
- 演职员通过同一明确类型获取 credits 并核对片 ID，保留原有片内角色和唯一姓名匹配规则。
- 响应保留输入的 Stremio ID；匹配成功时客户端额外核对实际 tmdbId 与输入编号一致。缓存算法版本更新，IMDb 原有路径保持兼容。
- 拒绝裸数字、零、负数、前导零、小数、指数、超出安全整数、路径片段和插件占位 ID。没有资料或身份不符时回退，不把不同影片拼起来。
- 不更换海报、不修改插件配置、原影片/播放链接、片源请求或观看记录。海报语言仍取决于插件。

## 验证

263 tests / 14 suites，包含客户端到 Worker 再回到双语展示的电影/剧集流程、单集父级和季集错误拒绝、类型缓存隔离、人物照片、严格输入校验及原 IMDb 回归。lint 0 errors / 263 既有 warnings，生产构建保留 2 个既有资源体积 warnings。

通过现有安全凭证实际查询：movie/tmdb:603 → The Matrix / 黑客帝国；series/tmdb:1399 → Game of Thrones / 权力的游戏。

浏览器独立合成目录先提供中文标题、中文测试海报和 tmdb:603，再由真实本地 Worker 补齐英文。检查卡片标题、原海报 URL、原 TMDB 详情链接，以及详情里的中英文简介和真实人物照片。合成目录不连接真实账号写操作，也不提供可播放资源。

唯一发布入口仍为 https://stremio2.ethankw.workers.dev/ 。实际版本、CI、线上复验范围与回滚命令记录在本轮交付收据。
