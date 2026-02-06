# 正文优化助手面板 - 快速参考

## 🎯 状态机

```
┌─────────┐
│  IDLE   │ 无优化数据
└────┬────┘
     │ 生成开始 + 实时模式
     ↓
┌─────────────┐
│  STREAMING  │ 实时优化中
└──────┬──────┘
       │ 优化完成
       ↓
┌─────────────┐
│  COMPLETED  │ 优化完成
└──────┬──────┘
       │ 用户发送消息
       ↓
┌─────────────┐
│  CHATTING   │ 对话中
└──────┬──────┘
       │ 清空记忆
       ↓
   COMPLETED
```

---

## 🔧 调试命令

### 查看状态
```javascript
// 面板状态
WBAP.ResponseOptimizer._state.assistant.panelState

// 数据状态
WBAP.ResponseOptimizer._state.assistant.originalContent
WBAP.ResponseOptimizer._state.assistant.optimizedContent

// 对话历史
WBAP.ResponseOptimizer._state.assistant.conversationHistory

// 流式快照
WBAP.ResponseOptimizer._state.assistant.streamingSnapshot
```

### 手动操作
```javascript
// 更新显示
WBAP.ResponseOptimizer.renderPanelContent()

// 更新按钮
WBAP.ResponseOptimizer.updatePanelButtons()

// 切换状态
WBAP.ResponseOptimizer._state.assistant.panelState = 
    WBAP.ResponseOptimizer.PANEL_STATE.COMPLETED
```

---

## 📊 按钮状态规则

| 按钮 | 启用条件 | 禁用条件 |
|------|---------|---------|
| 差异对比 | 有优化数据 | 无优化数据 |
| 查看原文 | 有原文数据 | 无原文数据 |
| 发送消息 | 有优化数据 + 未处理中 | 无数据或处理中 |
| 输入框 | 有优化数据 + 未处理中 | 无数据或处理中 |
| 恢复原文 | 有优化数据 + 未处理中 | 无数据或处理中 |
| 接受优化 | 有优化数据 + 未处理中 | 无数据或处理中 |
| 清空记忆 | 有对话历史 | 无对话历史 |

---

## 🎨 状态显示内容

### IDLE (空闲)
```
👋 欢迎使用正文优化助手！
当前暂无优化数据。
当 AI 生成回复后，系统会自动进行优化处理。
您也可以点击消息旁的 🪄 按钮手动触发优化。
```

### STREAMING (流式中)
```
⏳ 正在进行实时优化...
实时内容将在下方显示

📄 原始内容 (XXX 字符)
[原始内容实时显示]

✨ 优化中 (XXX 字符) ⏳
[优化内容实时显示]
```

### COMPLETED (完成)
```
✅ 优化完成！
您可以询问模型为什么这样优化，或者提出修改建议。
点击右上角的 📊 按钮查看差异对比。
点击 📄 按钮可以查看优化前的原文。
```

### CHATTING (对话中)
```
[显示对话历史]
用户: 为什么这样优化？
助手: [AI 回复]
...
```

---

## 🚀 常用操作

### 打开面板
```javascript
WBAP.ResponseOptimizer.openAssistantPanel()
```

### 关闭面板
```javascript
WBAP.ResponseOptimizer.closeAssistantPanel()
```

### 切换面板
```javascript
WBAP.ResponseOptimizer.toggleAssistantPanel()
```

### 清空记忆
```javascript
WBAP.ResponseOptimizer.clearAssistantMemory()
```

---

## 🐛 常见问题

### Q: 面板显示空白？
```javascript
// 检查状态
console.log(WBAP.ResponseOptimizer._state.assistant.panelState)
// 手动渲染
WBAP.ResponseOptimizer.renderPanelContent()
```

### Q: 按钮无法点击？
```javascript
// 检查数据
console.log({
    hasOriginal: !!WBAP.ResponseOptimizer._state.assistant.originalContent,
    hasOptimized: !!WBAP.ResponseOptimizer._state.assistant.optimizedContent
})
// 手动更新
WBAP.ResponseOptimizer.updatePanelButtons()
```

### Q: 状态不正确？
```javascript
// 查看当前状态
console.log(WBAP.ResponseOptimizer._state.assistant.panelState)
// 手动切换
WBAP.ResponseOptimizer._state.assistant.panelState = 'completed'
WBAP.ResponseOptimizer.renderPanelContent()
```

---

## 📝 状态转换触发点

| 触发点 | 从状态 | 到状态 |
|--------|--------|--------|
| `handleGenerationStarted()` | ANY | STREAMING |
| `handleMessageReceived()` 完成 | STREAMING | COMPLETED |
| `manualOptimize()` 完成 | ANY | COMPLETED |
| `sendAssistantMessage()` | COMPLETED | CHATTING |
| `clearAssistantMemory()` | CHATTING | COMPLETED |
| `openAssistantPanel()` | ANY | 智能判断 |

---

## 🎯 关键函数

### 状态管理
- `determinePanelState()` - 智能判断状态
- `renderPanelContent()` - 统一渲染
- `updatePanelButtons()` - 更新按钮

### 子渲染函数
- `renderIdleContent()` - 空闲状态
- `renderStreamingContent()` - 流式状态
- `renderCompletedContent()` - 完成状态
- `renderAssistantMessages()` - 对话状态

### 事件处理
- `handleGenerationStarted()` - 生成开始
- `handleMessageReceived()` - 消息接收
- `sendAssistantMessage()` - 发送消息
- `clearAssistantMemory()` - 清空记忆

---

## 💡 最佳实践

1. **状态转换后立即渲染**
   ```javascript
   state.assistant.panelState = PANEL_STATE.COMPLETED
   renderPanelContent()  // 立即渲染
   ```

2. **数据更新后更新按钮**
   ```javascript
   state.assistant.originalContent = content
   updatePanelButtons()  // 更新按钮状态
   ```

3. **使用快照保存流式数据**
   ```javascript
   state.assistant.streamingSnapshot = {
       original: content,
       optimized: result,
       timestamp: Date.now()
   }
   ```

4. **打开面板前判断状态**
   ```javascript
   determinePanelState()  // 智能判断
   renderPanelContent()   // 渲染内容
   updatePanelButtons()   // 更新按钮
   ```

---

**版本**: v2.1.0  
**更新日期**: 2026-02-05
