# 片库已观看与未观看筛选

本修复只改变本 Fork 的片库展示，不修改观看状态、账号、插件或本机 Stremio 配置。

## 原因与依赖

锁定依赖 `@stremio/stremio-core-web@0.65.1` 的 npm gitHead 为 `c4806e8614452fd49d5dbb22db74afa88959b554`。上游 `Watched` 和 `NotWatched` 是排序：分别将 watched=true 和 false 排在前面，再按页返回累计结果，没有排除另一组。

- [对应版本排序逻辑](https://github.com/Stremio/stremio-core/blob/c4806e8614452fd49d5dbb22db74afa88959b554/src/models/library_with_filters.rs)
- [对应版本序列化](https://github.com/Stremio/stremio-core/blob/c4806e8614452fd49d5dbb22db74afa88959b554/stremio-core-web/src/model/serialize_library.rs)

## 显示规则

仅在 library 模型中，sort=watched 只显示核心输出 watched=true 的项目；sort=notwatched 只显示 watched=false 的项目。电影和剧集使用同一个核心布尔字段，与卡片勾选标识和标记菜单保持一致，不根据播放进度、时间戳或片名推断完成状态。缺失或非布尔字段不归入任一组。

原项目对象、ID、deep links 与顺序均保留。其他排序及 continue_watching 模型保持原有结果。

## 分页与空结果

锁定核心先排序、后分页，目标观看状态组形成连续前缀。若已加载项目全属于目标组，保留下一页；遇到另一组后，目标组已经完整加载，停止加载无关后续页。没有匹配项目时显示“此分类暂无已观看内容”或“此分类暂无未观看内容”，而不是误称整个片库为空。

升级核心依赖时应重新确认上述分组/分页约定，运行筛选与分页回归测试。

## 验证与发布

单元测试覆盖两组互斥、进度不代替观看状态、电影/剧集、未知字段、源对象不变、其他排序/继续观看、空组、超过一页以及核心状态更新后的重新筛选。浏览器验收分为明确标注的隔离模拟数据和真实账号的只读列表对照；不为测试写入用户观看记录。

按原私人预览再个人入口流程发布干净构建，实际版本和回滚 UUID 记录在任务 outputs 的发布回执。
