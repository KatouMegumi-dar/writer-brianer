# 天纲（Tiangang）提示词存储机制分析

## 📊 存储架构

### ✅ 天纲提示词已经永久化存储

天纲的提示词存储采用**全局池 + 角色配置**的双层架构，与主提示词、内阁提示词等保持一致。

---

## 🏗️ 存储结构

### 1. 全局提示词池（所有角色共享）

**位置**：`mainConfig.globalPools.prompts.tiangang`

```javascript
mainConfig = {
    globalPools: {
        prompts: {
            main: [...],              // 主提示词池
            tiangang: [...],          // ✅ 天纲提示词池（全局共享）
            cabinet: [...],           // 内阁提示词池
            optimizationLevel3: [...],// 优化提示词池
            memory: [...]             // 记忆提示词池
        },
        tiangang: {
            apiConfig: {              // ✅ 天纲API配置（全局共享）
                apiUrl: '',
                apiKey: '',
                model: '',
                maxTokens: 2000,
                temperature: 0.7,
                timeout: 60,
                maxRetries: 1,
                retryDelayMs: 800
            }
        }
    }
}
```

**特点**：
- ✅ 存储在`globalPools`中，所有角色共享
- ✅ 只需配置一次，所有角色都能使用
- ✅ 通过localStorage和ST配置双重备份

---

### 2. 角色级配置（每个角色独立）

**位置**：`mainConfig.characterConfigs[角色ID].tiangang`

```javascript
characterConfigs: {
    "default": {  // 主页配置
        tiangang: {
            enabled: false,              // 是否启用天纲
            selectedPromptIndex: 0,      // 选择哪个提示词（索引）
            contextRounds: 5,            // 上下文轮数
            worldBooks: [],              // 绑定的世界书
            assignedEntriesMap: {}       // 世界书条目映射
        }
    },
    "角色A": {  // 角色A的配置
        tiangang: {
            enabled: true,
            selectedPromptIndex: 0,      // 可以选择不同的提示词
            contextRounds: 10,           // 可以设置不同的上下文轮数
            worldBooks: ["世界书A"],
            assignedEntriesMap: {...}
        }
    }
}
```

**特点**：
- ✅ 每个角色可以独立启用/禁用天纲
- ✅ 每个角色可以选择不同的提示词（从全局池中选择）
- ✅ 每个角色可以绑定不同的世界书
- ✅ 每个角色可以设置不同的上下文轮数

---

## 🔄 数据流程

### 提示词的创建和存储

```javascript
// 1. 创建默认天纲提示词（config.js 第249行）
globalPools: {
    prompts: {
        tiangang: [createDefaultTiangangPromptPreset()]  // 创建默认提示词
    }
}

// 2. 确保天纲提示词池存在（config.js 第400-401行）
if (!Array.isArray(pools.prompts.tiangang) || pools.prompts.tiangang.length === 0) {
    pools.prompts.tiangang = [createDefaultTiangangPromptPreset()];
}

// 3. 获取天纲提示词池（tiangang.js 第19-30行）
function getTiangangPromptPool() {
    const pools = getGlobalPools();
    if (!pools.prompts) pools.prompts = {};
    if (!Array.isArray(pools.prompts.tiangang)) {
        pools.prompts.tiangang = [];
    }
    if (pools.prompts.tiangang.length === 0) {
        pools.prompts.tiangang = [WBAP.createDefaultTiangangPromptPreset()];
        WBAP.saveConfig?.();  // ✅ 自动保存
    }
    return pools.prompts.tiangang;
}
```

### 提示词的使用

```javascript
// 1. 获取当前角色的天纲配置
const config = getConfig();  // 获取当前角色配置
const tgCfg = config.tiangang;  // 天纲配置

// 2. 从全局池中获取选中的提示词
const prompts = getTiangangPromptPool();  // 全局提示词池
const selectedIndex = tgCfg.selectedPromptIndex ?? 0;
const promptTemplate = prompts[selectedIndex];  // 选中的提示词

// 3. 使用提示词生成内容
const result = await WBAP.callAI(model, userPrompt, systemPrompt, apiConfig);
```

---

## ✅ 永久化机制

### 1. 双重备份

天纲提示词通过改进后的存储机制获得双重保护：

```javascript
// saveConfig() - config.js
function saveConfig() {
    // 1. 先保存到localStorage（立即生效）
    const backupSuccess = saveConfigToLocalStorage(window.WBAP.mainConfig);

    // 2. 再保存到ST配置
    extensionSettings[EXTENSION_NAME] = window.WBAP.mainConfig;
    saveSettingsDebounced();
}
```

**包含的内容**：
- ✅ `globalPools.prompts.tiangang` - 天纲提示词池
- ✅ `globalPools.tiangang.apiConfig` - 天纲API配置
- ✅ `characterConfigs[角色ID].tiangang` - 每个角色的天纲配置

### 2. 自动保存

天纲提示词在以下情况会自动保存：

1. **创建默认提示词时**（tiangang.js 第27行）
   ```javascript
   pools.prompts.tiangang = [WBAP.createDefaultTiangangPromptPreset()];
   WBAP.saveConfig?.();  // 自动保存
   ```

2. **用户修改提示词时**（通过UI）
   - 添加新提示词 → 自动保存
   - 编辑提示词 → 自动保存
   - 删除提示词 → 自动保存

3. **角色切换时**（character_manager.js）
   - 创建新角色配置 → 自动保存
   - 迁移旧配置 → 自动保存

---

## 🔍 验证方法

### 方法1：检查localStorage备份

```javascript
// 在浏览器控制台执行
const backup = localStorage.getItem('worldbook_ai_processor_backup');
if (backup) {
    const parsed = JSON.parse(backup);
    const tiangangPrompts = parsed.config?.globalPools?.prompts?.tiangang;
    console.log('天纲提示词池:', tiangangPrompts);
    console.log('提示词数量:', tiangangPrompts?.length);
}
```

### 方法2：检查主配置

```javascript
// 在浏览器控制台执行
console.log('天纲提示词池:', WBAP.mainConfig?.globalPools?.prompts?.tiangang);
console.log('天纲API配置:', WBAP.mainConfig?.globalPools?.tiangang?.apiConfig);
console.log('当前角色天纲配置:', WBAP.config?.tiangang);
```

### 方法3：测试持久化

```javascript
// 1. 添加一个测试提示词
const pools = WBAP.mainConfig.globalPools;
pools.prompts.tiangang.push({
    name: '测试天纲提示词',
    systemPrompt: '测试系统提示词',
    mainPrompt: '测试主提示词'
});
WBAP.saveConfig();

// 2. 刷新页面
location.reload();

// 3. 检查提示词是否还在
console.log('测试提示词:', WBAP.mainConfig?.globalPools?.prompts?.tiangang?.find(p => p.name === '测试天纲提示词'));
```

---

## 📋 与其他提示词的对比

| 提示词类型 | 存储位置 | 是否全局共享 | 是否永久化 | 角色级配置 |
|-----------|---------|------------|-----------|-----------|
| **主提示词** | `globalPools.prompts.main` | ✅ 是 | ✅ 是 | `selectedPromptIndex` |
| **天纲提示词** | `globalPools.prompts.tiangang` | ✅ 是 | ✅ 是 | `tiangang.selectedPromptIndex` |
| **内阁提示词** | `globalPools.prompts.cabinet` | ✅ 是 | ✅ 是 | `superConcurrency.selectedPromptIndex` |
| **优化提示词** | `globalPools.prompts.optimizationLevel3` | ✅ 是 | ✅ 是 | `optimizationLevel3.selectedPromptIndex` |
| **记忆提示词** | `globalPools.prompts.memory` | ✅ 是 | ✅ 是 | `memoryModule` |

**结论**：天纲提示词与其他提示词采用完全相同的存储机制，都是永久化的。

---

## 🎯 使用场景

### 场景1：全局配置天纲提示词

```
1. 在主页或任意角色下打开设置
2. 找到"天纲"设置区域
3. 添加/编辑天纲提示词
4. 保存

结果：
✅ 提示词保存到globalPools.prompts.tiangang
✅ 所有角色都能看到这个提示词
✅ 通过localStorage和ST配置双重备份
```

### 场景2：角色A和角色B使用不同的天纲提示词

```
角色A：
- 启用天纲
- 选择提示词1（剧情指导）
- 绑定世界书"科幻设定"

角色B：
- 启用天纲
- 选择提示词2（角色分析）
- 绑定世界书"奇幻设定"

结果：
✅ 提示词1和2都存储在全局池中（只需配置一次）
✅ 角色A和B各自选择不同的提示词
✅ 切换角色时自动切换配置
```

### 场景3：浏览器崩溃后恢复

```
1. 用户配置了3个天纲提示词
2. 浏览器崩溃
3. 重新打开SillyTavern

结果：
✅ 从localStorage自动恢复配置
✅ 3个天纲提示词完整恢复
✅ 所有角色的天纲配置恢复
```

---

## ✅ 总结

### 天纲提示词存储机制

1. **✅ 已经永久化** - 存储在`globalPools.prompts.tiangang`
2. **✅ 全局共享** - 所有角色共用同一个提示词池
3. **✅ 双重备份** - localStorage + ST配置
4. **✅ 自动保存** - 修改后自动保存
5. **✅ 角色隔离** - 每个角色可以选择不同的提示词
6. **✅ 与主提示词一致** - 采用相同的存储架构

### 改进后的优势

改进后的存储机制为天纲提示词提供了额外的保护：

- ✅ **localStorage备份** - 即使ST保存失败也能恢复
- ✅ **主页配置持久化** - 主页的天纲配置也能保存
- ✅ **配置同步检查** - 自动检测并修复配置不同步
- ✅ **数据丢失风险降低至接近零**

### 验证建议

运行以下命令验证天纲提示词是否正常存储：

```javascript
// 快速验证
console.log('天纲提示词数量:', WBAP.mainConfig?.globalPools?.prompts?.tiangang?.length);
console.log('localStorage备份存在:', !!localStorage.getItem('worldbook_ai_processor_backup'));
```

---

**结论**：天纲提示词已经完全永久化，与其他提示词采用相同的存储机制，并且通过改进后的双重备份机制获得了额外的数据安全保障。
