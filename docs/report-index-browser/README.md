# Report Index Tag Browser

本工具用于浏览和维护 `deepresearch/reports/report_index.json` 的检索标签。

## 启动

在仓库根目录运行：

```powershell
node docs/report-index-browser/server.js
```

然后打开：

```text
http://127.0.0.1:3220
```

## 功能

- 按 `best_for` 查看对应游戏。
- 按 `tags.<group>` 查看对应游戏。
- 按 `gameplay_categories` 查看对应游戏。
- 查看单个游戏拥有的全部检索标签。
- 添加、移除、重命名、删除 tag。
- 编辑单个游戏的 `annotation_notes` 和可选 `annotation_status`。
- 保存时直接写回 `deepresearch/reports/report_index.json`。

## 保存和备份

每次保存前，服务会把当前索引备份到：

```text
deepresearch/reports/_index_backups/report_index.<timestamp>.json
```

写回规则：

- 只修改 `report_index.json`。
- 不修改 `record.json`。
- 不修改任何报告正文。
- 保存前后都会校验 JSON 结构。
- 游戏引用的 tag 必须存在于对应 vocabulary。

## 新增标签回测规则

新建任何 `best_for`、`tags.<group>` 或 `gameplay_categories` 值之前，先确认现有 vocabulary 不能表达这个检索意图。

如果确实需要新增标签，必须回看已经进入 `report_index.json` 的历史游戏：

- 找出明显也符合这个新标签的旧游戏，并同步补标。
- 如果没有旧游戏适合补标，在 `vocabulary.backfill_audit_notes` 或本次工作记录中说明原因。
- 不要新增以 `design` 结尾的泛化标签，例如用 `tower defense`，不要用 `tower defense design`。
- 不要为了单个游戏的特殊措辞创建过细标签；这类信息写进 `annotation_notes`。

## 测试临时索引

如果要用临时 JSON 测试写回逻辑，可以指定 `REPORT_INDEX_PATH`：

```powershell
$env:REPORT_INDEX_PATH="D:\AI\meow-agent\deepresearch\reports\report_index.test.json"
node docs/report-index-browser/server.js
```

## API

- `GET /api/index`
  - 返回完整索引和派生的 tag-to-games 反向索引。
- `POST /api/game-tags`
  - 保存单个游戏的 `best_for`、`tags`、`gameplay_categories`、`annotation_notes`。
- `POST /api/tag-membership`
  - 按 tag 批量增加或移除游戏。
- `POST /api/vocabulary`
  - 新建、重命名、删除 vocabulary tag。
