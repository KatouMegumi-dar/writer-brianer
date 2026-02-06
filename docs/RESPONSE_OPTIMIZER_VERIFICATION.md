# 正文优化助手面板验证清单

## 快速验证步骤

### ✅ 步骤 1: 基本加载验证

1. 刷新 SillyTavern 页面
2. 打开浏览器控制台（F12）
3. 检查是否有错误日志
4. 验证模块加载成功：
   ```javascript
   console.log('状态枚举:', WBAP.ResponseOptimizer.PANEL_STATE);
   // 应该输出: {IDLE: 'idle', STREAMING: 'streaming', COMPLETED: 'completed', CHATTING: 'chatting'}
   ```

**预期结果**: ✅ 无错误，状态枚举正确输出

---

### ✅ 步骤 2: 空闲状态验证

1. 点击悬浮球打开助手面板
2. 验证显示内容：
   - 欢迎消息
   - "当前暂无优化数据"
   - 操作引导

3. 验证按钮状态：
   - 差异对比按钮：禁用（透明）
   - 原文按钮：禁用（透明）
   - 输入框：禁用，占位符显示"等待优化完成后可以对话..."
   - 恢复/接受按钮：禁用

**预期结果**: ✅ 显示空闲状态，所有按钮正确禁用

---

### ✅ 步骤 3: 实时优化验证（如果启用）

1. 在设置中启用"实时模式"
2. 发送消息触发 AI 回复
3. 验证面板行为：
   - 自动打开
   - 显示"正在进行实时优化..."
   - 显示原始内容（实时更新）
   - 显示优化内容（实时更新）

4. 等待优化完成
5. 验证面板切换到完成状态：
   - 显示"优化完成！"
   - 提供操作引导
   - 按钮全部启用

**预期结果**: ✅ 流式内容实时显示，完成后自动切换状态

---

### ✅ 步骤 4: 手动优化验证

1. 点击消息旁的魔杖按钮 🪄
2. 等待优化完成
3. 点击魔杖按钮打开面板
4. 验证显示内容：
   - 显示"优化完成！"
   - 操作引导清晰

5. 验证按钮状态：
   - 差异对比按钮：启用
   - 原文按钮：启用
   - 输入框：启用
   - 恢复/接受按钮：启用

**预期结果**: ✅ 显示完成状态，所有按钮启用

---

### ✅ 步骤 5: 差异对比验证

1. 点击差异对比按钮 📊
2. 验证差异面板：
   - 正确显示
   - 绿色背景+删除线 = 原文删除
   - 红色背景 = 新增内容
   - 图例显示正确

3. 点击关闭按钮
4. 验证差异面板关闭

**预期结果**: ✅ 差异对比正确显示和关闭

---

### ✅ 步骤 6: 原文查看验证

1. 点击原文按钮 📄
2. 验证原文面板：
   - 正确显示
   - 内容为优化前的原文
   - 文本框只读

3. 点击关闭按钮
4. 验证原文面板关闭

**预期结果**: ✅ 原文正确显示和关闭

---

### ✅ 步骤 7: 对话功能验证

1. 在输入框输入："为什么这样优化？"
2. 点击发送或按回车
3. 验证对话行为：
   - 用户消息显示
   - 显示"思考中..."加载状态
   - AI 回复显示
   - 对话历史保留

4. 验证面板状态：
   - 自动切换到对话状态
   - 欢迎消息消失
   - 显示对话历史

5. 验证记忆计数：
   - 显示"记忆: 1/10 轮"

**预期结果**: ✅ 对话功能正常，状态正确切换

---

### ✅ 步骤 8: 清空记忆验证

1. 点击"清空记忆"按钮
2. 验证行为：
   - 对话历史清空
   - 显示完成状态欢迎消息
   - 记忆计数归零："记忆: 0/10 轮"
   - 清空记忆按钮禁用

**预期结果**: ✅ 记忆清空，面板返回完成状态

---

### ✅ 步骤 9: 重新打开面板验证

1. 关闭助手面板
2. 重新打开面板
3. 验证显示内容：
   - 如果有对话历史 → 显示对话
   - 如果无对话但有优化数据 → 显示完成状态
   - 如果无数据 → 显示空闲状态

4. 验证按钮状态正确

**预期结果**: ✅ 面板状态正确恢复

---

### ✅ 步骤 10: 按钮状态动态验证

1. 在无数据时：
   - 尝试点击差异按钮 → 应该无反应或提示"暂无数据"
   - 尝试点击原文按钮 → 应该无反应或提示"暂无数据"
   - 输入框应该禁用

2. 在有数据时：
   - 所有按钮应该可点击
   - 输入框应该可输入

3. 在处理中时：
   - 发送按钮应该禁用
   - 输入框应该禁用

**预期结果**: ✅ 按钮状态根据数据和处理状态正确变化

---

## 常见问题排查

### 问题 1: 面板打开后显示空白

**排查步骤**:
```javascript
// 检查面板状态
console.log('面板状态:', WBAP.ResponseOptimizer._state.assistant.panelState);
console.log('面板打开:', WBAP.ResponseOptimizer._state.assistant.isOpen);

// 手动渲染
WBAP.ResponseOptimizer.renderPanelContent();
```

---

### 问题 2: 按钮状态不正确

**排查步骤**:
```javascript
// 检查数据状态
console.log('优化数据:', {
    hasOriginal: !!WBAP.ResponseOptimizer._state.assistant.originalContent,
    hasOptimized: !!WBAP.ResponseOptimizer._state.assistant.optimizedContent
});

// 手动更新按钮
WBAP.ResponseOptimizer.updatePanelButtons();
```

---

### 问题 3: 实时模式不显示流式内容

**排查步骤**:
```javascript
// 检查配置
console.log('流式模式:', WBAP.ResponseOptimizer.getConfig().streamingMode);

// 检查快照
console.log('流式快照:', WBAP.ResponseOptimizer._state.assistant.streamingSnapshot);

// 检查拦截状态
console.log('拦截中:', WBAP.ResponseOptimizer._state.intercepting);
console.log('处理中:', WBAP.ResponseOptimizer._state.isProcessingOptimization);
```

---

### 问题 4: 状态切换不正确

**排查步骤**:
```javascript
// 查看当前状态
console.log('当前状态:', WBAP.ResponseOptimizer._state.assistant.panelState);

// 查看状态枚举
console.log('状态枚举:', WBAP.ResponseOptimizer.PANEL_STATE);

// 手动切换状态（测试用）
WBAP.ResponseOptimizer._state.assistant.panelState = WBAP.ResponseOptimizer.PANEL_STATE.COMPLETED;
WBAP.ResponseOptimizer.renderPanelContent();
```

---

## 性能验证

### 内存泄漏检查

1. 打开浏览器性能监视器
2. 执行多次优化（10次以上）
3. 检查内存使用是否持续增长
4. 验证快照数据正确更新（不累积）

**预期结果**: ✅ 内存使用稳定，无泄漏

---

### 响应速度检查

1. 点击按钮时应该立即响应
2. 状态切换应该流畅
3. 流式更新应该平滑（80ms 节流）

**预期结果**: ✅ 响应迅速，无卡顿

---

## 回滚方法

如果验证失败需要回滚：

```bash
cd "writer brianer/modules"
git checkout response_optimizer.js
# 或者从备份恢复
```

---

## 验证通过标准

- ✅ 所有 10 个验证步骤通过
- ✅ 无控制台错误
- ✅ 按钮状态正确
- ✅ 状态切换流畅
- ✅ 无内存泄漏
- ✅ 响应速度快

---

**验证日期**: ________  
**验证人**: ________  
**验证结果**: ☐ 通过 ☐ 失败  
**备注**: ________
