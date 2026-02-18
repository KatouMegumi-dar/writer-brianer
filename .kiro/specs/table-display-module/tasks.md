# 实现计划: 表格展示模块

## 概述

本计划将表格展示模块的设计分解为可执行的编码任务。模块使用 JavaScript 实现，遵循 writer 插件现有的代码结构和命名规范。

## 任务

- [x] 1. 创建模块基础结构和配置管理
  - [x] 1.1 创建 modules/table_display.js 模块文件
    - 使用 IIFE 封装，挂载到 window.WBAP.TableDisplay
    - 定义模块状态对象和 Logger
    - 导出 init、openSettings、getConfig 等公开 API
    - _需求: 1.1, 1.4_
  
  - [x] 1.2 实现配置管理函数
    - 实现 getGlobalTableDisplayConfig() 获取全局配置
    - 实现 getCharacterTableDisplayConfig() 获取角色配置
    - 实现 ensureTableDisplayConfig() 确保配置结构完整
    - 实现 saveConfig() 保存配置
    - _需求: 2.3, 4.1, 4.2, 8.4_
  
  - [x] 1.3 编写配置管理属性测试
    - **Property 3: 存储位置正确性**
    - **验证: 需求 4.1, 4.2**

- [x] 2. 实现模板管理器
  - [x] 2.1 实现模板数据结构和验证
    - 定义 TableTemplate 接口
    - 实现 validateTemplate() 验证模板格式
    - 实现 generateTemplateUid() 生成唯一 ID
    - _需求: 3.3_
  
  - [x] 2.2 实现模板 CRUD 操作
    - 实现 importTemplate(jsonString) 导入模板
    - 实现 exportTemplate(templateUid) 导出模板
    - 实现 deleteTemplate(templateUid) 删除模板
    - 实现 getTemplates() 获取所有模板
    - 实现 getTemplateByUid(uid) 按 UID 获取模板
    - _需求: 3.1, 3.2, 3.4, 3.5_
  
  - [x] 2.3 编写模板管理属性测试
    - **Property 1: 模板导入往返一致性**
    - **Property 2: 无效模板拒绝**
    - **验证: 需求 3.1, 3.2, 3.3, 3.4, 3.5**

- [x] 3. 实现表格管理器
  - [x] 3.1 实现表格数据结构
    - 定义 TableData 和 TableRow 接口
    - 实现 generateTableUid() 和 generateRowUid()
    - _需求: 4.2_
  
  - [x] 3.2 实现表格 CRUD 操作
    - 实现 createTable(templateUid) 创建表格
    - 实现 deleteTable(tableUid) 删除表格
    - 实现 getTable(tableUid) 获取表格
    - 实现 getTables() 获取所有表格
    - _需求: 4.5, 5.1_
  
  - [x] 3.3 实现行操作
    - 实现 insertRow(tableUid, rowData) 插入行
    - 实现 updateRow(tableUid, rowIndex, rowData) 更新行
    - 实现 deleteRow(tableUid, rowIndex) 删除行
    - 实现 updateCell(tableUid, rowIndex, colIndex, value) 更新单元格
    - _需求: 5.3, 5.4, 5.5_
  
  - [x] 3.4 编写表格管理属性测试
    - **Property 5: 表格编辑往返一致性**
    - **Property 4: 角色切换数据隔离**
    - **验证: 需求 4.3, 5.3, 5.4, 5.5**

- [x] 4. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 5. 实现编辑指令解析器
  - [x] 5.1 实现标签提取功能
    - 实现 extractTableEditTag(message, tagName) 提取编辑标签
    - 实现 extractContentTag(message, tagName) 提取正文标签
    - 支持可配置的标签名（默认 'content'）
    - _需求: 6.1, 6.2_
  
  - [x] 5.2 实现指令解析功能
    - 实现 parseEditInstructions(editString) 解析编辑指令
    - 支持 insertRow()、updateRow()、deleteRow() 三种指令
    - 实现 formatParams() 格式化参数
    - 实现 classifyParams() 分类参数
    - _需求: 6.3_
  
  - [x] 5.3 实现指令执行功能
    - 实现 executeInstructions(instructions) 执行指令
    - 实现 executeInsert(instruction) 执行插入
    - 实现 executeUpdate(instruction) 执行更新
    - 实现 executeDelete(instruction) 执行删除
    - 添加错误处理和日志记录
    - _需求: 6.4, 6.5, 6.6, 6.7_
  
  - [x] 5.4 编写编辑指令解析器属性测试
    - **Property 6: 标签提取正确性**
    - **Property 7: 编辑指令解析正确性**
    - **Property 8: 编辑指令执行正确性**
    - **Property 9: 无效指令容错性**
    - **验证: 需求 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**

- [x] 6. 实现消息渲染器
  - [x] 6.1 实现表格区域渲染
    - 实现 renderTableArea(messageId) 渲染表格区域
    - 实现折叠/展开功能
    - 实现 tab 切换功能
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 6.2 实现表格内容渲染
    - 实现 renderTableContent(tableData) 渲染表格内容
    - 使用 CSV 风格简洁展示
    - 支持表头和数据行区分
    - _需求: 7.6_
  
  - [x] 6.3 集成消息渲染事件
    - 监听 CHARACTER_MESSAGE_RENDERED 事件
    - 在消息底部注入表格区域
    - 支持配置开关控制渲染
    - _需求: 7.7_

- [x] 7. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 8. 实现设置面板 UI
  - [x] 8.1 创建设置面板模态框
    - 实现 ensureSettingsModal() 创建模态框 DOM
    - 包含模块启用开关
    - 包含标签提取配置输入框
    - 包含消息渲染开关
    - _需求: 1.3, 6.1, 7.7, 8.1_
  
  - [x] 8.2 实现模板管理 UI
    - 实现模板列表展示
    - 实现模板导入按钮和文件选择
    - 实现模板删除功能
    - 实现模板导出功能
    - _需求: 3.1, 3.4_
  
  - [x] 8.3 实现表格管理 UI
    - 实现表格列表展示
    - 实现表格选择和内容展示
    - 实现单元格编辑功能
    - 实现行添加/删除按钮
    - _需求: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 8.4 实现 API 配置 UI
    - 实现 API 配置表单
    - 支持复用现有 API 端点
    - _需求: 2.1, 2.2_

- [x] 9. 集成到主面板
  - [x] 9.1 添加主面板入口按钮
    - 在 writer 主面板添加"表格展示"按钮
    - 绑定点击事件打开设置面板
    - _需求: 1.2, 1.3_
  
  - [x] 9.2 实现模块初始化
    - 在 writer 插件初始化时调用 TableDisplay.init()
    - 注册事件监听器
    - 加载配置
    - _需求: 1.1_
  
  - [x] 9.3 实现模块启用/禁用逻辑
    - 实现 setEnabled(enabled) 设置启用状态
    - 禁用时停止数据提取和渲染
    - 禁用时保留已有数据
    - _需求: 8.1, 8.2, 8.3_
  
  - [x] 9.4 编写模块启用/禁用属性测试
    - **Property 10: 模块禁用数据保留**
    - **验证: 需求 8.2, 8.3, 8.4**

- [x] 10. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加快 MVP 开发
- 每个任务引用具体需求以保证可追溯性
- 检查点确保增量验证
- 属性测试验证通用正确性属性
- 单元测试验证具体示例和边界情况
