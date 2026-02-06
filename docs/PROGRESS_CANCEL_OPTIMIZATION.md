# Writer Brianer 进度条取消功能优化文档

## 📋 问题描述

用户反馈进度条界面的取消功能存在问题：
1. 点击"取消全部"按钮无法取消记忆模块的任务
2. 点击叉号（×）也无法取消单个记忆模块的任务

## 🔍 问题分析

### 根本原因

记忆模块（`memory_manager.js`）**完全没有实现取消机制**，导致UI层的取消按钮无法生效。

### 对比分析：自选模式 vs 记忆模块

| 功能 | 自选模式 (processing.js) | 记忆模块 (memory_manager.js) |
|------|------------------------|---------------------------|
| **AbortController创建** | ✅ 为每个任务创建 | ❌ 完全没有 |
| **Signal传递** | ✅ 通过buildApiConfig传递 | ❌ 不传递 |
| **取消回调注册** | ✅ 注册到UI层 | ❌ 完全没有 |
| **取消信号检查** | ✅ 检查signal.aborted | ❌ 没有检查 |
| **错误处理** | ✅ 捕获AbortError | ❌ 没有特殊处理 |

### 取消信号传递链路

**自选模式（正常工��）**:
```
UI取消按钮 → triggerCancelTask() → cancelSingleTask() → controller.abort()
→ signal.aborted = true → callAI检查signal → fetch中止 → AbortError捕获
```

**记忆模块（断裂）**:
```
UI取消按钮 → triggerCancelTask() → ❌ 没有回调函数 → 无法中止
→ callMemoryEndpoint继续执行 → callAI继续执行 → fetch继续进行
```

---

## ✅ 优化方案

### 1. 修改 `callMemoryEndpoint` 函数

**文件**: `memory_manager.js` 第1415-1423行

**优化前**:
```javascript
async function callMemoryEndpoint(block, endpoint, modelOverride = '') {
    if (!WBAP.callAI || !endpoint) return `${block.system}\n\n${block.user}`;
    try {
        return await WBAP.callAI(modelOverride || block.model || endpoint.model || '', block.user, block.system, endpoint);
    } catch (e) {
        Logger.error(TAG, 'memory endpoint failed', e);
        return `${block.system}\n\n${block.user}`;
    }
}
```

**优化后**:
```javascript
async function callMemoryEndpoint(block, endpoint, modelOverride = '', signal = null) {
    if (!WBAP.callAI || !endpoint) return `${block.system}\n\n${block.user}`;

    // 检查是否已取消
    if (signal?.aborted) {
        throw new Error('Task cancelled');
    }

    try {
        // 创建API配置并传递signal
        const apiConfig = {
            ...endpoint,
            signal: signal
        };
        return await WBAP.callAI(modelOverride || block.model || endpoint.model || '', block.user, block.system, apiConfig);
    } catch (e) {
        // 检查是否是取消错误
        if (e.name === 'AbortError' || e.message === 'Task cancelled') {
            Logger.log(TAG, 'memory endpoint cancelled');
            throw e;  // 重新抛出取消错误
        }
        Logger.error(TAG, 'memory endpoint failed', e);
        return `${block.system}\n\n${block.user}`;
    }
}
```

**改进点**:
- ✅ 添加 `signal` 参数
- ✅ 在调用前检查 `signal.aborted`
- ✅ 将signal传递给callAI
- ✅ 捕获并重新抛出取消错误

---

### 2. 在 `processMessage` 中创建 AbortController

**文件**: `memory_manager.js` 第1425行

**优化后**:
```javascript
async function processMessage(options = {}) {
    const mem = ensureMemoryConfig();
    if (!mem.enabled) return '';

    // ... 参数处理 ...

    // 创建AbortController用于取消任务
    const abortControllers = new Map();
    let abortAllRequested = false;

    // 取消全部任务的函数
    const abortAll = () => {
        abortAllRequested = true;
        Logger.log(TAG, '取消全部记忆模块任务');
        abortControllers.forEach((controller, taskId) => {
            controller.abort();
            if (showProgress) {
                WBAP.UI.updateProgressTask(taskId, '已取消', 100);
            }
        });
    };

    // 取消单个任务的函数
    const cancelSingleTask = (taskId) => {
        const controller = abortControllers.get(taskId);
        if (controller) {
            Logger.log(TAG, `取消记忆模块任务: ${taskId}`);
            controller.abort();
            if (showProgress) {
                WBAP.UI.updateProgressTask(taskId, '已取消', 100);
            }
        }
    };

    // ... 收集任务 ...
}
```

**改进点**:
- ✅ 创建 `abortControllers` Map存储所有任务的AbortController
- ✅ 实现 `abortAll()` 函数取消所有任务
- ✅ 实现 `cancelSingleTask()` 函数取消单个任务

---

### 3. 为每个任务创建 AbortController 并注册回调

**文件**: `memory_manager.js` 第1530-1550行

**优化后**:
```javascript
if (showProgress) {
    // ... 显示进度面板 ...

    // 为快照任务创建AbortController
    const snapshotController = new AbortController();
    abortControllers.set('memory-snapshot', snapshotController);
    WBAP.UI.addProgressTask('memory-snapshot', '快照: 高维快照/短期记忆', '等待中...');

    // 为总结书任务创建AbortController并添加任务
    for (const task of summaryTasks) {
        const controller = new AbortController();
        abortControllers.set(task.id, controller);
        WBAP.UI.addProgressTask(task.id, task.name, '等待中...');
    }

    // 为表格书任务创建AbortController并添加任务
    for (const task of tableTasks) {
        const controller = new AbortController();
        abortControllers.set(task.id, controller);
        WBAP.UI.addProgressTask(task.id, task.name, '等待中...');
    }

    // 注册取消回调
    if (WBAP.UI.setCancelAllCallback) {
        WBAP.UI.setCancelAllCallback(abortAll);
    }
    if (WBAP.UI.setCancelTaskCallback) {
        // 注册快照任务的取消回调
        WBAP.UI.setCancelTaskCallback('memory-snapshot', cancelSingleTask);
        // 注册总结书任务的取消回调
        summaryTasks.forEach(task => {
            WBAP.UI.setCancelTaskCallback(task.id, cancelSingleTask);
        });
        // 注册表格书任务的取消回调
        tableTasks.forEach(task => {
            WBAP.UI.setCancelTaskCallback(task.id, cancelSingleTask);
        });
    }
}
```

**改进点**:
- ✅ 为每个任务创建独立的AbortController
- ✅ 将AbortController存储到Map中
- ✅ 注册 `abortAll` 到UI层的"取消全部"按钮
- ✅ 为每个任务注册 `cancelSingleTask` 到UI层的叉号按钮

---

### 4. 在任务执行中传递 signal 并检查取消状态

#### 快照任务

**优化后**:
```javascript
const snapshotPromise = (async () => {
    const taskId = 'memory-snapshot';
    const controller = abortControllers.get(taskId);
    const signal = controller?.signal;

    try {
        // 检查是否已取消
        if (signal?.aborted) {
            throw new Error('Task cancelled');
        }

        if (showProgress) {
            WBAP.UI.updateProgressTask(taskId, '处理中...', 10);
        }

        const block = buildMemoryBlock({ /* ... */ });
        block.model = mem.model;

        // 传递signal给callMemoryEndpoint
        const result = await callMemoryEndpoint(block, defaultEndpoint, mem.model, signal);

        if (showProgress) {
            WBAP.UI.updateProgressTask(taskId, '完成', 100);
        }
        return result;
    } catch (e) {
        // 检查是否是取消错误
        if (e.name === 'AbortError' || e.message === 'Task cancelled') {
            Logger.log(TAG, 'snapshot task cancelled');
            if (showProgress) {
                WBAP.UI.updateProgressTask(taskId, '已取消', 100);
            }
            return '';
        }

        Logger.error(TAG, 'snapshot task failed', e);
        if (showProgress) {
            WBAP.UI.updateProgressTask(taskId, `失败: ${(e?.message || '').slice(0, 20)}`, 100);
        }
        return '';
    }
})();
```

**改进点**:
- ✅ 获取任务的AbortController和signal
- ✅ 在执行前检查 `signal.aborted`
- ✅ 将signal传递给 `callMemoryEndpoint`
- ✅ 捕获取消错误并更新UI状态为"已取消"

#### 总结书任务和表格书任务

同样的优化应用到总结书任务和表格书任务：

```javascript
const summaryPromises = summaryTasks.map(async (task) => {
    const controller = abortControllers.get(task.id);
    const signal = controller?.signal;

    try {
        // 检查是否已取消
        if (signal?.aborted) {
            throw new Error('Task cancelled');
        }

        // ... 处理逻辑 ...

        const content = await buildWorldbookContent([task.bookName]);

        // 再次检查是否已取消（异步操作后）
        if (signal?.aborted) {
            throw new Error('Task cancelled');
        }

        // 传递signal
        const result = await callMemoryEndpoint(block, task.endpoint, mem.model, signal);

        // ... 更新进度 ...
    } catch (e) {
        // 检查是否是取消错误
        if (e.name === 'AbortError' || e.message === 'Task cancelled') {
            Logger.log(TAG, 'summary task cancelled', task.name);
            if (showProgress) {
                WBAP.UI.updateProgressTask(task.id, '已取消', 100);
            }
            return '';
        }
        // ... 错误处理 ...
    }
});
```

**改进点**:
- ✅ 在异步操作前后都检查取消状态
- ✅ 传递signal到所有API调用
- ✅ 正确处理取消错误

---

## 📊 优化效果对比

| 功能 | 优化前 | 优化后 |
|------|--------|--------|
| **点击"取消全部"** | ❌ 无效 | ✅ 立即取消所有记忆任务 |
| **点击单个任务的叉号** | ❌ 无效 | ✅ 立即取消该任务 |
| **UI状态更新** | ❌ 任务继续显示"处理中" | ✅ 显示"已取消" |
| **网络请求** | ❌ 继续发送 | ✅ 立即中止 |
| **错误处理** | ❌ 没有特殊处理 | ✅ 正确识别取消错误 |

---

## 🎯 完整的取消流程

### 取消全部任务

```
1. 用户点击"取消全部"按钮
   ↓
2. UI层调用 triggerCancelAll()
   ↓
3. 触发 abortAll() 回调
   ↓
4. 遍历所有 abortControllers
   ↓
5. 调用每个 controller.abort()
   ↓
6. signal.aborted 变为 true
   ↓
7. 正在执行的任务检查 signal.aborted
   ↓
8. 抛出 'Task cancelled' 错误
   ↓
9. catch块捕获错误
   ↓
10. 更新UI状态为"已取消"
```

### 取消单个任务

```
1. 用户点击任务的叉号按钮
   ↓
2. UI层调用 triggerCancelTask(taskId)
   ↓
3. 触发 cancelSingleTask(taskId) 回调
   ↓
4. 获取该任务的 AbortController
   ↓
5. 调用 controller.abort()
   ↓
6. signal.aborted 变为 true
   ↓
7. 该任务检查 signal.aborted
   ↓
8. 抛出 'Task cancelled' 错误
   ↓
9. catch块捕获错误
   ↓
10. 更新UI状态为"已取消"
```

---

## 🔍 关键代码位置

| 修改内容 | 文件 | 行号 | 说明 |
|---------|------|------|------|
| 添加signal参数 | memory_manager.js | 1415 | callMemoryEndpoint函数签名 |
| 检查取消状态 | memory_manager.js | 1418-1420 | 调用前检查signal.aborted |
| 传递signal | memory_manager.js | 1423-1426 | 创建apiConfig并传递signal |
| 处理取消错误 | memory_manager.js | 1428-1432 | 捕获并重新抛出AbortError |
| 创建AbortController | memory_manager.js | 1450-1452 | 创建abortControllers Map |
| 实现abortAll | memory_manager.js | 1455-1464 | 取消全部任务函数 |
| 实现cancelSingleTask | memory_manager.js | 1467-1475 | 取消单个任务函数 |
| 注册取消回调 | memory_manager.js | 1563-1580 | 注册到UI层 |
| 快照任务取消 | memory_manager.js | 1595-1635 | 添加signal和取消检查 |
| 总结任务取消 | memory_manager.js | 1638-1690 | 添加signal和取消检查 |
| 表格任务取消 | memory_manager.js | 1693-1745 | 添加signal和取消检查 |

---

## 🧪 测试方法

### 测试取消全部

1. 启用记忆模块
2. 配置多个总结书和表格书
3. 发送消息触发记忆模块处理
4. 在进度面板中点击"取消全部"按钮
5. **预期结果**: 所有记忆任务立即显示"已取消"，网络请求中止

### 测试取消单个任务

1. 启用记忆模块
2. 配置多个总结书和表格书
3. 发送消息触发记忆模块处理
4. 在进度面板中点击某个任务的叉号按钮
5. **预期结果**: 该任务显示"已取消"，其他任务继续执行

### 测试取消后的状态

1. 取消任务后，检查浏览器控制台
2. **预期日志**:
   ```
   [世界书AI处理器] 取消记忆模块任务: memory-snapshot
   [世界书AI处理器] memory endpoint cancelled
   [世界书AI处理器] snapshot task cancelled
   ```

---

## 📝 注意事项

1. **signal传递链路**
   - 必须将signal从processMessage → callMemoryEndpoint → callAI → fetch
   - 任何一环断裂都会导致取消失败

2. **异步操作后的检查**
   - 在每个await后都应该检查signal.aborted
   - 特别是在buildWorldbookContent和loadCategoryContent之后

3. **错误类型判断**
   - 需要同时检查 `e.name === 'AbortError'` 和 `e.message === 'Task cancelled'`
   - 因为不同的取消方式可能产生不同的错误类型

4. **UI状态更新**
   - 取消后必须更新UI状态为"已取消"
   - 否则用户会看到任务一直显示"处理中"

---

## 🎉 总结

### 优化前的问题

- ❌ 记忆模块完全没有取消机制
- ❌ UI层的取消按钮对记忆模块无效
- ❌ 用户无法中止长时间运行的记忆任务
- ❌ 网络请求继续发送，浪费资源

### 优化后的改进

- ✅ 完整的AbortController机制
- ✅ 取消全部和单个取消都正常工作
- ✅ 正确的错误处理和UI状态更新
- ✅ 与自选模式保持一致的取消体验
- ✅ 网络请求立即中止，节省资源

现在记忆模块的取消功能与自选模式完全一致，用户可以随时取消不需要的任务！🚀
