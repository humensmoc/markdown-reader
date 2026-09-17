# AGENTS.md — markdown-reader

## 项目约束

- 回答中不要带有 emoji。
- 不要运行 Luban。
- 不要尝试运行 Unity，也不要尝试关闭 Unity 的 Play 模式。

## 强制会话日志

- 每个用户回合都必须在最终回复前读取并执行本项目的
  `.agents/skills/conversation-topic-logger/SKILL.md`，不依赖隐式语义匹配。
- 日志根目录保持为 `D:/Software/ObsidianSyncVault/快捷指令/对话日志`，
  按 Skill 的 `YYYY/MM/YYYY-MM-DD.md` 结构写入；不要改成本项目内的目录。
- 来源项目使用当前任务工作区，Git 采集显式指定当前来源仓库，
  不得用日志目录所属仓库替代。
- 按 Skill 的共享锁协议串行更新，保留其他项目和历史回合；
  完成适用的跨日补齐、本轮追加与回读验证后，再发送最终回复。
- 目录无效、权限不足、锁占用或其他写入失败时，遵循 Skill 的失败处理规则，
  在最终回复中说明本轮未记入日志及实际原因，不静默切换目录。
