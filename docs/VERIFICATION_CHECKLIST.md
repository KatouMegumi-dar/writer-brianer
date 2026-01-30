# Writer插件改进验证清单

## 自动检查结果

### ✅ 语法检查
- [x] config.js - 语法正确
- [x] character_manager.js - 语法正确
- [x] ui_logic.js - 语法正确

### ✅ 代码完整性
- [x] 所有函数定义完整
- [x] 括号匹配正确
- [x] 没有明显的语法错误

---

## 手动验证步骤

### 第一步：基本加载验证

1. **重启SillyTavern**
2. **打开浏览器控制台**（F12）
3. **检查日志输出**，应该看到：

```
[世界书AI处理器] 主脚本 index.js 开始执行
[世界书AI处理器] 插件模块基路径 /scripts/extensions/third-party/writer brianer/modules/
[世界书AI处理器] 脚本 character_manager.js 加载成功
[世界书AI处理器] 脚本 config.js 加载成功
[世界书AI处理器] 脚本 ui_logic.js 加载成功
[世界书AI处理器] 所有模块加载完毕，开始初始化插件核心...
[世界书AI处理器] 主配置已从 SillyTavern 读取
[世界书AI处理器] 配置已备份到localStorage
[世界书AI处理器] 已监听CHARACTER_LOADED事件
[世界书AI处理器] 已监听CHAT_CHANGED事件
[世界书AI处理器] 已启动角色切换轮询检测（1秒间隔）
[世界书AI处理器] 配置同步检查已启动（5秒间隔）
[世界书AI处理器] 插件初始化成功
```

**预期结果**：
- ✅ 没有红色错误信息
- ✅ 看到"配置已备份到localStorage"
- ✅ 看到"已启动角色切换轮询检测"
- ✅ 看到"配置同步检查已启动"

**如果失败**：
- ❌ 检查是否有JavaScript错误
- ❌ 检查文件路径是否正确
- ❌ 尝试清除浏览器缓存后重试

---

### 第二步：localStorage备份验证

在浏览器控制台执行：

```javascript
// 检查localStorage备份
const backup = localStorage.getItem('worldbook_ai_processor_backup');
if (backup) {
    const parsed = JSON.parse(backup);
    console.log('✅ localStorage备份存在');
    console.log('备份版本:', parsed.version);
    console.log('备份时间:', new Date(parsed.timestamp));
    console.log('配置键:', Object.keys(parsed.config));
} else {
    console.log('❌ localStorage备份不存在');
}
```

**预期结果**：
- ✅ 显示"localStorage备份存在"
- ✅ 备份版本为1
- ✅ 配置包含characterConfigs、globalPools、globalSettings

**如果失败**：
- ❌ 检查浏览器是否禁用了localStorage
- ❌ 检查是否有存储空间限制

---

### 第三步：主页配置持久化验证

1. **在主页（不选择任何角色）**
2. **打开Writer插件设置**
3. **添加一个测试API端点**：
   - 名称：测试端点
   - URL：https://test.example.com
   - Key：test-key
   - 模型：gpt-4
4. **保存设置**
5. **切换到任意角色**
6. **切换回主页**
7. **再次打开Writer插件设置**

**预期结果**：
- ✅ "测试端点"仍然存在
- ✅ 配置没有丢失

**如果失败**：
- ❌ 主页配置仍然丢失
- ❌ 检查控制台是否有错误
- ❌ 检查是否正确使用了'default'键

---

### 第四步：角色切换验证

1. **切换到角色A**
2. **打开Writer插件设置**
3. **配置5个API端点**
4. **保存设置**
5. **切换到角色B**
6. **打开Writer插件设置**
7. **配置3个API端点**
8. **保存设置**
9. **切换回角色A**
10. **再次打开Writer插件设置**

**预期结果**：
- ✅ 角色A显示5个API端点
- ✅ 配置自动恢复
- ✅ 控制台显示"检测到角色变化"日志

**如果失败**：
- ❌ 配置没有切换
- ❌ 检查事件监听是否正常工作
- ❌ 检查轮询是否启动

---

### 第五步：数据恢复验证

**模拟ST保存失败**：

在浏览器控制台执行：

```javascript
// 1. 备份当前配置
const backup = localStorage.getItem('worldbook_ai_processor_backup');
console.log('备份已保存');

// 2. 删除ST配置（模拟保存失败）
const context = SillyTavern.getContext();
delete context.extensionSettings.worldbook_ai_processor;
console.log('ST配置已删除');

// 3. 刷新页面
location.reload();
```

刷新后检查：

```javascript
// 检查配置是否恢复
if (WBAP.mainConfig && WBAP.mainConfig.characterConfigs) {
    console.log('✅ 配置已从localStorage恢复');
    console.log('角色配置:', Object.keys(WBAP.mainConfig.characterConfigs));
} else {
    console.log('❌ 配置恢复失败');
}
```

**预期结果**：
- ✅ 页面加载时显示"已从本地备份恢复配置"通知
- ✅ 所有配置完整恢复
- ✅ 控制台显示"配置加载完成，来源: localStorage"

**如果失败**：
- ❌ 配置没有恢复
- ❌ 检查localStorage备份是否存在
- ❌ 检查loadConfig()函数逻辑

---

### 第六步：配置同步检查验证

在浏览器控制台执行：

```javascript
// 人为制造配置不同步
const wrongConfig = { test: 'wrong' };
window.WBAP.config = wrongConfig;
console.log('已人为制造配置不同步');

// 等待5秒，让同步检查运行
setTimeout(() => {
    if (window.WBAP.config !== wrongConfig) {
        console.log('✅ 配置同步检查正常工作');
        console.log('当前配置:', window.WBAP.config);
    } else {
        console.log('❌ 配置同步检查未生效');
    }
}, 6000);
```

**预期结果**：
- ✅ 5秒后显示"检测到配置不同步，已自动修复"通知
- ✅ 配置被自动修复
- ✅ 控制台显示"配置不同步！"错误日志

**如果失败**：
- ❌ 配置没有被修复
- ❌ 检查setInterval是否正常运行
- ❌ 检查validateConfigSync()函数

---

### 第七步：事件监听验证

在浏览器控制台执行：

```javascript
// 检查事件监听器状态
let eventCount = 0;
const originalSwitch = WBAP.CharacterManager.switchCharacter;
WBAP.CharacterManager.switchCharacter = function(...args) {
    eventCount++;
    console.log(`switchCharacter被调用，第${eventCount}次`);
    return originalSwitch.apply(this, args);
};

// 切换角色，观察调用次数
console.log('请切换角色，观察switchCharacter调用次数');
```

**预期结果**：
- ✅ 切换角色时switchCharacter被调用
- ✅ 控制台显示"检测到角色变化"日志
- ✅ 不会重复调用多次（应该只调用1次）

**如果失败**：
- ❌ switchCharacter没有被调用
- ❌ 检查事件监听器是否正常注册
- ❌ 检查轮询是否正常工作

---

### 第八步：UI功能验证

1. **打开Writer插件面板**
2. **检查以下功能是否正常**：
   - [ ] 设置面板能正常打开
   - [ ] API端点列表正常显示
   - [ ] 提示词列表正常显示
   - [ ] 添加/编辑/删除API端点正常
   - [ ] 保存设置正常
   - [ ] 切换角色后UI自动刷新

**预期结果**：
- ✅ 所有UI功能正常
- ✅ 没有显示异常或乱码
- ✅ 按钮点击响应正常

**如果失败**：
- ❌ UI显示异常
- ❌ 检查控制台是否有JavaScript错误
- ❌ 检查CSS是否正常加载

---

## 常见问题排查

### 问题1：插件无法加载

**症状**：控制台显示模块加载失败

**排查步骤**：
1. 检查文件路径是否正确
2. 检查文件权限
3. 清除浏览器缓存
4. 检查是否有语法错误

**解决方案**：
```bash
cd "writer brianer/modules"
node -c config.js
node -c character_manager.js
node -c ui_logic.js
```

---

### 问题2：配置丢失

**症状**：切换角色后配置消失

**排查步骤**：
1. 检查localStorage是否有备份
2. 检查角色切换事件是否触发
3. 检查switchCharacter()是否被调用

**解决方案**：
```javascript
// 手动恢复配置
const backup = localStorage.getItem('worldbook_ai_processor_backup');
if (backup) {
    const parsed = JSON.parse(backup);
    WBAP.mainConfig = parsed.config;
    WBAP.saveConfig();
    location.reload();
}
```

---

### 问题3：UI显示异常

**症状**：界面乱码或显示不正常

**排查步骤**：
1. 检查控制台是否有CSS加载错误
2. 检查是否有JavaScript错误
3. 检查UI函数是否正常定义

**解决方案**：
```javascript
// 检查UI对象
console.log('UI对象:', window.WBAP.UI);
console.log('UI函数:', Object.keys(window.WBAP.UI));
```

---

### 问题4：事件监听失效

**症状**：角色切换时配置不自动切换

**排查步骤**：
1. 检查控制台是否显示"事件监听器可能失效"警告
2. 检查轮询是否正常工作
3. 检查handleCharacterSwitch()是否被调用

**解决方案**：
- 轮询会自动接管，等待1秒即可
- 如果轮询也失效，检查setInterval是否被阻止

---

## 回滚步骤

如果验证失败，需要回滚到原始版本：

```bash
cd "writer brianer/modules"
cp config.js.backup config.js
cp character_manager.js.backup character_manager.js
cp ui_logic.js.backup ui_logic.js
```

清理localStorage：

```javascript
localStorage.removeItem('worldbook_ai_processor_backup');
localStorage.removeItem('worldbook_ai_processor_backup_version');
localStorage.removeItem('WBAP_current_character');
```

刷新页面：

```javascript
location.reload();
```

---

## 验证通过标准

所有以下检查项都通过，才算验证成功：

- [x] 插件正常加载，无错误
- [x] localStorage备份存在
- [x] 主页配置能保存和恢复
- [x] 角色切换时配置自动切换
- [x] ST配置丢失时能从localStorage恢复
- [x] 配置不同步时能自动修复
- [x] 事件监听正常工作
- [x] UI功能正常，无异常

---

## 联系支持

如果遇到无法解决的问题：

1. 导出控制台日志
2. 导出localStorage备份
3. 记录重现步骤
4. 提供浏览器和ST版本信息
