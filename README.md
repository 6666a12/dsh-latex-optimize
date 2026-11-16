# DSH 长对话 LaTeX 优化

针对 **DSH Desktop 内置 Harness 0.2.1-rc.2** 制作的客户端插件。对聊天区域内的离屏公式及含公式段落启用浏览器 `content-visibility: auto`，减少长对话的布局与绘制工作。

## 安装

1. 在 DSH Desktop 打开 **设置 → 插件 → 添加插件**。
2. 在包地址/安装来源中填入本地安装包的绝对路径：

   ```text
   D:\Workspace\dsh-latex-optimize\releases\dsh-latex-optimize-0.1.0.tgz
   ```

   也可以使用本项目目录的绝对路径 `D:\Workspace\dsh-latex-optimize`。推荐安装打包后的 tgz，避免后续源码编辑影响安装副本。
3. 启用 `dsh-latex-optimize`。按照 DSH 安装结果的提示刷新界面或重启桌面端，再重新打开长对话。
4. 输入框下方应出现 **长对话优化** 下拉框；在 **设置 → 通用** 中也可以找到同一开关。

本项目不修改 DSH 安装文件，不自动更改用户 profile，也没有自动安装/执行脚本。成品不带 npm 运行依赖，React 使用宿主已提供的版本。开发测试依赖不会进入安装包。

## 模式

| 模式 | 效果 |
| --- | --- |
| 公式与段落（默认） | 延迟离屏独立公式和含行内公式的正文段落布局。包含图片、视频、表格等复杂内容的段落不处理。 |
| 仅独立公式 | 只处理块级 KaTeX 公式，影响范围较小。 |
| 关闭 | 立即移除所有优化 CSS，恢复原始排版。 |

两个开关同步更新。偏好保存在当前 GUI 来源的 `localStorage`，只记录模式，不记录会话内容；不同端口/浏览器窗口的数据隔离规则由浏览器决定。存储不可用时仍可在当前窗口切换。

## 能解决什么

- 减少屏幕外大量 KaTeX DOM 的布局和绘制开销。
- 由浏览器在内容接近视口时自动恢复排版；不增加消息级轮询、滚动监听或 DOM 扫描器。
- 不替换聊天/Markdown 组件，不改变消息、公式源代码、链接、工具卡片或模型请求。
- 保留 KaTeX 的视觉 DOM 与 MathML；没有将内容变成图片、删除节点或改成 `display:none`。
- 对话以外的设置、预览、其他网页不匹配优化选择器；打印时关闭优化。

## 明确的边界

**这是一层布局/绘制优化，不是 KaTeX 解析缓存或消息虚拟列表。** 当前 DSH 会同步执行 KaTeX、DOMParser 和 React 元素构建，这些发生在 CSS 布局之前。插件不能消除这部分计算，也不能减少历史读取、投影构建、消息节点数量或 DOM 内存占用。如果卡顿主要发生在这些步骤，本插件改善会有限，不能保证“打开超长对话完全不卡”。公开接口没有安全的 Markdown 渲染中间件，因此没有修改宿主私有 React 对象。

首次不可见时，独立公式预估高度为 `4em`，含公式段落为 `6em`；浏览器在实际显示后记忆尺寸。特别高的公式或段落在首次滚动过去、窗口缩放时可能改变滚动条比例或阅读位置。遇到跳动可选“仅独立公式”或关闭。超长表格、很长的单个段落、折叠的工具组和原生页内查找行为仍由 DSH/Chromium 管理。自动化验证保留了 DOM，未声称测试了所有桌面端查找和复制快捷键。

仅声明已核对的 Harness 版本 `0.2.1-rc.2`。更新 DSH 后如出现版本不匹配，请重新核对 Slot 与 DOM 契约后更新版本范围，不要直接开启版本豁免。

## 关闭与卸载

- 暂停优化：任一开关选择“关闭”。
- 完全卸载：设置 → 插件中禁用/移除本包。Cordis 会清理注册的两个控件、样式及偏好同步监听器。
- 只保留一个小的本地模式偏好；如需重置，可清除该来源的 `localStorage` 键 `dsh-latex-optimize:v1`。不要为此清除其他应用数据。

## 开发与验证

```powershell
npm install --ignore-scripts
npm run check
npm run test:browser
New-Item -ItemType Directory -Force releases
npm run pack:local
```

浏览器测试默认使用 Windows 上安装的 Microsoft Edge。使用其他 Chromium 可设置 `DSH_TEST_BROWSER` 为可执行文件路径。测试只启动独立的无头浏览器，不替换 DSH Web 服务，不访问真实会话数据。

- `tests/unit.test.mjs`：偏好容错、同步、浏览器不支持时回退、资源释放、Slot 注册及包结构。
- `tests/browser.mjs`：真实 React 控件，800 个公式（400 个行内、400 个独立），样式作用域、开关同步、焦点、打印、滚动、缩放、MathML、DOM 不变及卸载。
- `test-results/browser-report.json`：浏览器版本、检查项与 5 轮交错运行的 DOM 插入/首次布局计时。
- `test-results/preview.png`：测试夹具预览，不是真实用户会话。

计时使用预先生成的 KaTeX HTML，因此只用于评估 CSS 布局收益，不代表真实 DSH 会话的端到端打开速度。每台机器的结果会不同。

## 接入依据

已通过当前运行时 Cordis Inspect 核对 `slots.inject` / `slots.register`、`settings.general.item`、`conversation.composer.dock`、主题 token，以及聊天 `conversation.chat.flow`。客户端包格式参照已安装的 `dsh-desktop-client-ui`；DOM 边界参照同版本 `dsh-client-ui-chat` 与 `dsh-client-ui-primitives`。

源码可直接阅读，无构建步骤：`index.js` 是空 Host 入口，`client.js` 是 DSH 原生 ModuleLoader 客户端包，`cordis.patch.yml` 只添加本插件。
