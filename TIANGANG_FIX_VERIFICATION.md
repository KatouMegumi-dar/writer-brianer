# 天纲模块Bug修复验证指南

## 修复内容

本次修复解决了天纲模块在多次执行时跳过任务执行的bug。

### 修复的问题

1. **任务ID拼写错误** - 修复了 `'wbap-tiagang'` → `'wbap-tiangang'`
2. **AbortSignal污染** - 改进了 `normalizeApiConfig` 函数，明确排除旧的signal
3. **配置对象清理** - 确保每次调用时使用干净的配置对象
4. **API层防御性检查** - 在 `api.js` 中添加了已中止signal的检测

### 修改的文件

- `modules/tiangang.js` (3处修改)
- `modules/api.js` (1处修改)

---

## 验证步骤

### 步骤1：清除缓存和状态

在浏览器开发者工具（F12）的Console中执行：

```javascript
// 清除响应缓存
if (window.WBAP && window.WBAP.clearResponseCache) {
    WBAP.clearResponseCache();
    console.log('✓ 响应缓存已清除');
}

// 检查天纲配置
const pools = WBAP.getGlobalPools();
console.log('天纲配置:', pools.tiangang);

// 刷新页面
location.reload();
```

### 步骤2：测试连续执行

1. **第一次测试**
   - 发送一条消息
   - 观察天纲进度条
   - 预期：正常执行60秒左右
   - 检查控制台是否有错误

2. **第二次测试（关键）**
   - 立即再发送一条消息
   - 观察天纲进度条
   - 预期：仍然正常执行60秒左右（不是4-7秒）
   - 检查是否有结果注入到消息中

3. **连续测试**
   - 连续发送3-5条消息
   - 每次都应该正常执行
   - 每次都应该有结果注入

### 步骤3：监控控制台日志

在Console中查找以下关键词：

```javascript
// 查找错误日志
console.log('=== 检查天纲日志 ===');

// 应该看到这些正常日志：
// "[世界书AI处理器] 天纲处理中..."
// "[世界书AI处理器] API Request: ..."
// "[世界书AI处理器] 天纲处理完成"

// 不应该看到这些错误：
// "Tiangang skipped: no prompt template"
// "Tiangang skipped: no API/model configured"
// "Tiangang skipped: no worldbook content available"
// "AbortError"
```

### 步骤4：检查配置完整性

```javascript
// 检查天纲API配置
const pools = WBAP.getGlobalPools();
const apiConfig = pools.tiangang?.apiConfig;

console.log('=== 天纲API配置检查 ===');
console.log('API URL:', apiConfig?.apiUrl || '未配置');
console.log('API Key:', apiConfig?.apiKey ? '已配置' : '未配置');
console.log('Model:', apiConfig?.model || '未配置');
console.log('Timeout:', apiConfig?.timeout || '默认');

// 检查是否有残留的signal（应该没有）
if (apiConfig?.signal) {
    console.warn('⚠️ 警告：配置中存在残留的signal属性');
} else {
    console.log('✓ 配置干净，无残留signal');
}
```

### 步骤5：测试不同场景

1. **场景A：正常执行**
   - 确保天纲已启用
   - 确保API配置正确
   - 确保世界书已绑定
   - 发送消息，观察正常执行

2. **场景B：快速连续执行**
   - 发送第一条消息
   - 不等待完成，立即发送第二条
   - 观察两个任务是否都正常执行

3. **场景C：更换配置后执行**
   - 修改API URL或Key
   - 保存配置
   - 发送消息测试
   - 再次发送消息（第二次）
   - 观察是否仍然正常

---

## 预期结果

### ✅ 修复成功的标志

1. **进度条正常**
   - 天纲进度条显示"处理中..."
   - 进度从0%逐渐增加到100%
   - 耗时60秒左右（取决于API响应速度）

2. **结果正常注入**
   - 消息中包含 `<details data-wbap="tiangang">` 标签
   - 标签内有天纲分析结果
   - 内容不为空

3. **控制台无错误**
   - 无 "Tiangang skipped" 警告
   - 无 "AbortError" 错误
   - 无 signal 相关错误

4. **连续执行正常**
   - 第二次、第三次执行时间与第一次相同
   - 每次都有结果输出
   - 不会出现4-7秒就完成的情况

### ❌ 仍有问题的标志

1. **快速完成**
   - 天纲任务4-7秒就显示"完成"
   - 但消息中没有天纲结果

2. **控制台错误**
   - 出现 "Tiangang skipped" 警告
   - 出现 "AbortError" 错误

3. **配置污染**
   - `apiConfig.signal` 属性存在
   - 控制台显示 signal 相关错误

---

## 故障排查

### 问题1：仍然快速完成

**可能原因：**
- 浏览器缓存未清除
- 配置未正确保存

**解决方法：**
```javascript
// 强制清除所有缓存
localStorage.clear();
sessionStorage.clear();
location.reload(true);
```

### 问题2：配置检查失败

**可能原因：**
- 天纲API配置缺失
- 世界书未绑定

**解决方法：**
1. 打开插件设置
2. 检查"天纲"标签页
3. 确认API URL、Key、Model都已填写
4. 确认已选择世界书
5. 保存配置

### 问题3：仍有signal残留

**可能原因：**
- 修复未生效
- 文件未正确保存

**解决方法：**
1. 检查 `tiangang.js` 文件是否已修改
2. 确认第70-91行的 `normalizeApiConfig` 函数包含：
   ```javascript
   const { signal: _oldSignal, ...cleanConfig } = apiConfig;
   ```
3. 确认第255行的任务ID为 `'wbap-tiangang'`（不是 `'wbap-tiagang'`）
4. 重启SillyTavern

---

## 技术细节

### 修复原理

**问题根源：**
- `getTiangangApiProfile()` 返回同一个对象引用
- `apiConfig.signal` 在多次调用间被重用
- 旧的 `AbortSignal` 可能已经 aborted，导致新请求立即被取消

**修复方法：**
- 使用解构赋值排除旧的 `signal` 属性
- 每次调用时创建全新的配置对象
- 使用新创建的 `AbortSignal`

### 代码对比

**修复前：**
```javascript
function normalizeApiConfig(apiConfig, defaultTimeout, signal) {
    return {
        ...apiConfig,  // ⚠️ 包含旧的signal
        signal: signal
    };
}
```

**修复后：**
```javascript
function normalizeApiConfig(apiConfig, defaultTimeout, signal) {
    const { signal: _oldSignal, ...cleanConfig } = apiConfig;  // ✓ 排除旧signal
    return {
        ...cleanConfig,
        signal: signal  // ✓ 使用新signal
    };
}
```

---

## 联系支持

如果修复后仍有问题，请提供以下信息：

1. 控制台完整日志（F12 → Console → 右键 → Save as...）
2. 天纲配置截图
3. 问题复现步骤
4. 浏览器版本和操作系统

---

**修复日期：** 2026-01-31
**修复版本：** v2.1.1
**修复作者：** Claude Sonnet 4.5
