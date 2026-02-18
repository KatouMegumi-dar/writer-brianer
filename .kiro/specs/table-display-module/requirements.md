# 需求文档

## 简介

本文档定义了 writer（笔者之脑）插件的表格展示子模块需求。该模块将 st-memory-enhancement 的表格功能简化后集成到 writer 插件中，作为纯展示模块使用，不进行记忆注入到 AI 上下文。

## 术语表

- **Table_Display_Module**: 表格展示模块，writer 插件的子模块，负责表格数据的展示和管理
- **Table_Template**: 表格模板/预设，定义表格结构（列名、表格名称等），全局共享
- **Table_Content**: 表格内容，基于模板填充的实际数据，角色独立存储
- **Edit_Instruction**: 编辑指令，从 AI 回复中提取的表格操作命令（insertRow、updateRow、deleteRow）
- **Content_Tag**: 内容标签，用于分割 AI 回复正文和表格数据的 XML 标签（默认 `<content>`）
- **Message_Renderer**: 消息渲染器，在 AI 回复底部渲染表格状态的组件
- **Global_Pools**: 全局配置池，存储在 mainConfig.globalPools 中的共享配置

## 需求

### 需求 1：子模块集成

**用户故事：** 作为用户，我希望表格展示模块作为 writer 的子模块存在，以便我能像使用其他模块一样方便地访问它。

#### 验收标准

1. THE Table_Display_Module SHALL 作为 writer 插件的独立子模块存在于 modules/ 目录下
2. WHEN 用户打开 writer 主面板 THEN THE Table_Display_Module SHALL 在主面板显示入口按钮
3. WHEN 用户点击入口按钮 THEN THE Table_Display_Module SHALL 打开独立的设置面板
4. THE Table_Display_Module SHALL 遵循 writer 现有模块的代码结构和命名规范

### 需求 2：独立 API 配置

**用户故事：** 作为用户，我希望表格模块有独立的 API 配置界面，以便未来可以扩展 AI 更新表格功能。

#### 验收标准

1. THE Table_Display_Module SHALL 提供独立的 API 配置界面
2. THE Table_Display_Module SHALL 支持复用 writer 现有的 API 端点配置
3. WHEN 用户配置 API 端点 THEN THE Table_Display_Module SHALL 将配置存储在 globalPools.tableDisplay 中
4. IF 用户未配置独立 API THEN THE Table_Display_Module SHALL 使用默认的空配置

### 需求 3：表格模板导入

**用户故事：** 作为用户，我希望能导入 st-memory-enhancement 格式的表格预设/模板，以便复用已有的表格结构定义。

#### 验收标准

1. THE Table_Display_Module SHALL 支持导入 JSON 格式的表格模板
2. WHEN 用户导入模板 THEN THE Table_Display_Module SHALL 解析模板中的列名、表格名称等结构信息
3. THE Table_Display_Module SHALL 验证导入的 JSON 格式是否符合 st-memory-enhancement 模板规范
4. IF 导入的 JSON 格式无效 THEN THE Table_Display_Module SHALL 显示错误提示并拒绝导入
5. WHEN 模板导入成功 THEN THE Table_Display_Module SHALL 将模板存储到 globalPools.tableDisplay.templates 中

### 需求 4：模板全局共享与内容角色独立

**用户故事：** 作为用户，我希望表格模板是全局共享的，而表格内容是角色独立的，以便在不同角色间复用相同的表格结构。

#### 验收标准

1. THE Table_Display_Module SHALL 将表格模板存储在 mainConfig.globalPools.tableDisplay.templates 中
2. THE Table_Display_Module SHALL 将表格内容存储在角色配置的 tableDisplay.tables 中
3. WHEN 用户切换角色 THEN THE Table_Display_Module SHALL 加载该角色对应的表格内容
4. WHEN 用户修改模板 THEN THE Table_Display_Module SHALL 同步更新所有使用该模板的角色表格结构
5. THE Table_Display_Module SHALL 支持同一角色使用多个不同模板的表格

### 需求 5：完整表格查看与编辑

**用户故事：** 作为用户，我希望在设置面板中查看和编辑所有表格的完整内容，以便管理表格数据。

#### 验收标准

1. WHEN 用户进入设置面板 THEN THE Table_Display_Module SHALL 显示当前角色的所有表格列表
2. WHEN 用户选择某个表格 THEN THE Table_Display_Module SHALL 显示该表格的完整内容
3. THE Table_Display_Module SHALL 支持用户手动编辑表格单元格内容
4. THE Table_Display_Module SHALL 支持用户手动添加和删除表格行
5. WHEN 用户修改表格内容 THEN THE Table_Display_Module SHALL 自动保存更改到角色配置

### 需求 6：表格数据提取

**用户故事：** 作为用户，我希望模块能从 AI 回复中自动提取表格编辑指令，以便自动更新表格内容。

#### 验收标准

1. THE Table_Display_Module SHALL 提供可配置的标签提取设置（默认标签：`<content>`）
2. WHEN AI 回复包含表格编辑标签 THEN THE Table_Display_Module SHALL 分割正文和表格数据
3. THE Table_Display_Module SHALL 解析 st-memory-enhancement 格式的编辑指令：insertRow()、updateRow()、deleteRow()
4. WHEN 解析到 insertRow 指令 THEN THE Table_Display_Module SHALL 在指定表格中插入新行
5. WHEN 解析到 updateRow 指令 THEN THE Table_Display_Module SHALL 更新指定表格的指定行
6. WHEN 解析到 deleteRow 指令 THEN THE Table_Display_Module SHALL 删除指定表格的指定行
7. IF 编辑指令格式无效 THEN THE Table_Display_Module SHALL 忽略该指令并记录警告日志

### 需求 7：消息底部渲染

**用户故事：** 作为用户，我希望在每条 AI 回复底部看到当前表格状态，以便快速了解表格变化。

#### 验收标准

1. WHEN AI 回复渲染完成 THEN THE Message_Renderer SHALL 在消息底部添加表格展示区域
2. THE Message_Renderer SHALL 默认以折叠状态显示表格区域
3. WHEN 用户展开表格区域 THEN THE Message_Renderer SHALL 显示一排表格标签（tab）
4. WHEN 用户点击某个表格 tab THEN THE Message_Renderer SHALL 展开该表格的内容
5. WHEN 用户点击某个表格 tab THEN THE Message_Renderer SHALL 隐藏其他表格内容
6. THE Message_Renderer SHALL 以简洁的 CSV 风格表格展示数据
7. THE Message_Renderer SHALL 支持用户配置是否启用消息底部渲染

### 需求 8：模块启用控制

**用户故事：** 作为用户，我希望能够启用或禁用表格展示模块，以便根据需要控制模块功能。

#### 验收标准

1. THE Table_Display_Module SHALL 提供模块启用/禁用开关
2. WHEN 模块被禁用 THEN THE Table_Display_Module SHALL 停止所有表格数据提取和渲染
3. WHEN 模块被禁用 THEN THE Table_Display_Module SHALL 保留已有的表格数据不被删除
4. THE Table_Display_Module SHALL 将启用状态存储在角色配置中
