# dsh-sidebar-pin

把侧栏的面板入口固定在顶部。

侧栏把全局面板——**插件**、**Token 用量**、**待办**，以及之后任何插件新增的面板——放在
工作区/会话列表上方的一排。这一排会跟着列表一起滚走。这个插件把它钉在侧栏视口顶部，
会话列表再长也能随时点到这些入口。

**设置**上方有一个图钉按钮，用来打开或关闭固定；选择存在 `localStorage` 里，对该配置的
每个窗口生效。

## 用法

1. 默认已固定：面板行停在顶部，会话列表从它下面滚过。
2. 点一下设置上方的图钉，面板行恢复成随列表滚动；再点一下重新固定。

插件只是浏览器端的装饰：不注册 Host 路由、不提供模型工具、不把数据发出页面。

## 安装

**插件** → **添加插件** → 填入本目录。

## 兼容性

要求侧栏把全局面板行渲染在 `[data-sidebar-scrollport]` 里（随产品提供的
`@deepseek-ai/dsh-client-ui-sidebar` 就是这样）。开关依赖 `sidebar.footer.action` 席位；
席位不存在时固定仍然生效，只是没有按钮。

## 与宿主的契约

固定块本质上是一层针对侧栏自身 DOM 的样式，因此下面四条是硬依赖；`test/client.test.mjs`
把插件这一侧逐条断言住了：

| 依赖 | 宿主改了会怎样 |
|---|---|
| `[data-sidebar-scrollport]` 标记滚动视口 | 选择器整体失效：面板行又跟着滚走，但不报错 |
| 面板行是该视口唯一的直接 `<nav>` | 失去 sticky、底色和分隔线 |
| 列表区是该视口的直接 `<div>`、位于第 4 栅格行 | `container-type` 落空，列表按整列高度计算，最后几行可能被裁掉 |
| 宿主基线行高是 `8px max-content 2px max-content` | 固定的 `… 1fr` 模板对不上，差几像素：出现跳动或空条 |

宿主源码在磁盘上时，可以连宿主那侧一起校验：
`DSH_SIDEBAR_DIR=<@deepseek-ai/dsh-client-ui-sidebar 包目录> npm test`。

## 测试

`npm test`（node:test，零依赖）。测试在 `vm` 沙箱里用假的 `window.__ModuleLoader__`
和 `document` 加载 `client.js`，断言模块表面：注入的服务、注册的 `sidebar.footer.action`
行、样式选择器与栅格模板、根标记、中英词典，以及销毁时样式与标记都被移除。
不渲染 React，也不接触真实侧栏 DOM。

宿主源码解到磁盘上之后，连宿主那侧一起校验（本机已解到工作区）：

```bash
cd "D:\\Deepseek work\\workplace\\dsh-sidebar-pin"
DSH_SIDEBAR_DIR="D:\\Deepseek work\\workplace\\sidebar-src\\dsh\\node_modules\\@deepseek-ai\\dsh-client-ui-sidebar" npm test
```

- 带 `DSH_SIDEBAR_DIR`：8 pass / 0 fail / 0 skipped，宿主契约（栅格模板、滚动视口标记、`> nav` / `> div` 结构）逐条对实际源码命中；
- 不带：12 pass / 0 fail / 1 skipped（该用例自动跳过并说明原因）。

## 自检

**插件** → 选中本插件进入详情页，里面有一块 **自检**：四项只读检查，**只在点「运行自检」时执行**。

| 检查项 | 通过条件 | 失败时说明 |
|---|---|---|
| 样式已注入 | 文档里有本插件的 `<style data-plugin-css="dsh-sidebar-pin/sidebar-pin.css">`，且含 `[data-sidebar-scrollport]` 规则 | 找不到样式，或样式表没有该规则 |
| 偏好可读 | `localStorage['dsh-sidebar-pin:enabled']` 未设置（走默认）或为 `1`/`0` | 读取失败，或值不可识别 |
| 固定状态 | `<html data-dsh-sidebar-pin>` 与已存偏好一致 | 两者不一致 |
| 宿主契约 | `[data-sidebar-scrollport] > nav` 存在，且面板行计算样式为 `position: sticky` | 「宿主结构可能已变（或侧栏处于收起状态）」 |

每条检查 2s 上限，卡住算失败而不是冻住整块。结果只存在组件内存里；**复制结果**把
Markdown 列表写进剪贴板（`- [x] 标签 — 通过` / `- [ ] 标签 — 失败：原因`）。挂载时不跑任何检查，
也不把数据发出页面。

## 从 GitHub 安装

```sh
dsh plugin --profile desktop add github:879745uhjun/dsh-sidebar-pin
```

装好后刷新 Web 页面。
