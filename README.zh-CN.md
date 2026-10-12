# Stintwork

[English](README.md) | 简体中文

Stintwork 使用你自己的编程智能体，将工作项（work item）从想法推进到变更合并。它在本地看板上展示阶段（stage），并在工作段（stint）之间传递任务简报（brief）和交接说明（handoff）。

```bash
npx stintwork
```

在 Git 仓库中启动。它会启动本地服务器，打印地址并打开浏览器。

**状态：** v0.1，仅限本地使用。Claude Code 和 Codex 已通过 ACP 验证。Grok Build 为实验性支持，尚未完成端到端验证。

Stintwork 已发布到 npm。请参阅[入门指南](docs/getting-started.md) (英文)，将第一个工作项推进到已交付（Shipped，merged）。

## 环境要求

- Node.js 22.12 或更新版本，以及 Git。
- 自行安装的 Claude Code 或 Codex CLI，位于 PATH 中且已登录。

登录你要使用的智能体：

```bash
claude auth login
# 或者：
codex login
```

一个智能体就够了。Stintwork 内置 Claude Code 和 Codex 的 ACP 适配器。它使用你现有的登录状态，不处理你的凭据。

CLI 支持 `--no-open`、`--help` 和 `--version`。使用 `--no-open` 时，请自行打开打印出的地址。按 Ctrl+C 停止服务器。

## 概念

- **工作项：** 一项功能、缺陷或小改动，文件位于 `.scratch/<slug>/`。
- **阶段：** 工作流（workflow）的一部分。必须通过关卡（gate）才能进入下一阶段。
- **工作段：** 一个智能体在某个阶段的一轮工作，也可以针对某张工单（ticket）。以任务简报开始，以交接说明结束。Stintwork 会在工作段结束时创建检查点提交（checkpoint）。

## 看板

Pipeline 视图展示各个阶段，以及用于处理问题、权限请求、关卡和记忆变更提议（memory proposal）的 **Needs you**（需要你处理）队列。按 `c` 创建工作项，或在 ⌘K 中使用 **Create work item**（创建工作项），Ctrl+K 也可使用。填写标题、工作流、可选的里程碑（milestone）和意图。创建操作会生成一次提交。

**Setup**（设置）标签会预览拟议的项目文件。选择要应用的变更，再确认一次提交。它还会报告各个智能体的阶段技能是否已找到、缺失或无法判断。Stintwork 从不安装技能。

内置工作流使用 YAML：

- **Feature:** Clarify → Spec → Tickets → Implement → Review → Ship.
- **Bug:** Diagnose → Fix → Review → Ship.
- **Quick:** Do → Review → Ship.

**Customise**（自定义）将内置工作流复制到 `.stintwork/workflows/`，供你编辑。**Edit roadmap**（编辑路线图）用于修改路线图（roadmap）中的里程碑及其工作项，每次编辑生成一次提交。

为每个工作段选择智能体和权限级别（permission level）：**Ask**（询问）、**Edit freely**（自由编辑）或 **Autonomous**（自主执行）。阅读任务简报预览中针对各个智能体的警告。通过开发者备注回复交接说明中未解决的事项，备注会进入下一份任务简报。

评审（review）要求评审发现（findings）已有决策、当前检查（checks）通过、没有过时的证据，且没有未处理的记忆变更提议。Ship 表示合并：使用 **Merge locally**（本地合并），或在明确确认推送后，通过 `gh` 创建拉取请求。

## 项目文件

规格说明（spec）、工单、关卡批准记录和评审决策都保存在项目中。工作项有了工作树后，请在那里编辑其文件；抽屉面板会显示路径。

| 路径 | 内容 |
|---|---|
| `.scratch/<slug>/` | `spec.md`、`issues/NN-*.md`、`workflow.yaml`、`review.yaml` |
| `.stintwork/roadmap.md` | 里程碑及其工作项 |
| `.stintwork/config` | `permissionLevel` 和本地 `checks` |
| `.stintwork/workflows/` | 自定义工作流 YAML |
| `.stintwork/local/` | 由 Git 忽略的工作段日志和交接说明 |

智能体对 `GLOSSARY.md`、`docs/adr/` 和 `AGENTS.md` 的变更会成为记忆变更提议，由你接受或拒绝。

## 仓库内容

贡献者参考资料：

| 路径 | 说明 |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) (英文) | 第一个工作项，从创建到已交付（merged） |
| [`docs/plan.md`](docs/plan.md) (英文) | 架构、里程碑和后续工作 |
| [`GLOSSARY.md`](GLOSSARY.md) (英文) | 产品术语 |
| [`docs/adr/`](docs/adr/) (英文) | 决策记录 |
| [`docs/brief.md`](docs/brief.md) (英文) | 产品简报和范围 |
| [`docs/research/2026-10-09-spikes.md`](docs/research/2026-10-09-spikes.md) (英文) | ACP 及任务简报／交接说明的验证证据 |
| [`prototype/`](prototype/) (英文) | 一次性设计参考；已选定 Pipeline |
| [`spikes/acp-probe/`](spikes/acp-probe/) (英文) | ACP 能力检查 |

### 从本地检出目录运行

贡献者可以使用 pnpm 构建检出的 Stintwork 仓库。在该目录运行前两条命令，再到你的项目 Git 仓库中启动：

```bash
pnpm install
pnpm build
cd /path/to/your/project
node /path/to/stintwork/dist/bin.js
```

请用实际的绝对路径替换示例中的路径。

采用 [Apache-2.0](LICENSE) 许可证。
