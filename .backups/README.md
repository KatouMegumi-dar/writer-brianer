# 备份文件说明

本目录包含插件的备份文件，用于在需要时恢复原始版本。

## 📋 备份文件列表

### 模块备份

1. **character_manager.js.backup**
   - 原始版本：v2.1.0
   - 备份日期：2026-01-31
   - 说明：角色管理模块的原始版本

2. **config.js.backup**
   - 原始版本：v2.1.0
   - 备份日期：2026-01-31
   - 说明：配置管理模块的原始版本

3. **ui_logic.js.backup**
   - 原始版本：v2.1.0
   - 备份日期：2026-01-31
   - 说明：UI逻辑模块的原始版本

4. **ui_logic.bak.js**
   - 原始版本：更早版本
   - 备份日期：2026-01-28
   - 说明：UI逻辑模块的更早备份

5. **_ui_logic.original.js**
   - 原始版本：最初版本
   - 备份日期：2026-01-28
   - 说明：UI逻辑模块的最初版本

### 配置备份

6. **memory_source.json.backup**
   - 原始版本：v2.1.0
   - 备份日期：2026-01-31
   - 说明：记忆源配置的原始版本

---

## 🔄 如何恢复备份

### 恢复单个文件

```bash
# 示例：恢复 character_manager.js
cp .backups/character_manager.js.backup modules/character_manager.js
```

### 恢复所有文件

```bash
# 恢复所有模块
cp .backups/character_manager.js.backup modules/character_manager.js
cp .backups/config.js.backup modules/config.js
cp .backups/ui_logic.js.backup modules/ui_logic.js

# 恢复配置
cp .backups/memory_source.json.backup prompts/memory_source.json
```

---

## ⚠️ 注意事项

1. **恢复前备份当前版本**
   - 在恢复旧版本前，先备份当前修改后的版本
   - 避免丢失修复内容

2. **检查兼容性**
   - 恢复旧版本可能导致功能异常
   - 确保了解恢复的影响

3. **测试功能**
   - 恢复后测试插件功能
   - 确保一切正常运行

---

## 📝 修复记录

### 2026-01-31 修复内容

**修复的文件：**
- `modules/tiangang.js` - 修复天纲模块bug
- `modules/api.js` - 添加signal状态检查
- `modules/persistent_storage.js` - 修复CSRF token错误

**修复的问题：**
1. 天纲模块多次执行时跳过任务
2. AbortSignal污染导致请求失败
3. 保存配置时CSRF token错误

**如需恢复到修复前版本：**
- 使用本目录中的备份文件
- 但会重新出现上述bug

---

## 🗑️ 清理建议

如果确认修复无问题，可以考虑：

1. **保留最近的备份**
   - 只保留 `*.backup` 文件（最新版本）
   - 删除 `*.bak.js` 和 `*.original.js`（旧版本）

2. **完全删除备份**
   - 如果修复稳定运行一段时间
   - 可以删除整个 `.backups` 目录

3. **压缩备份**
   - 将备份文件打包成 zip
   - 节省空间，保留恢复能力

---

**创建日期：** 2026-01-31
**维护者：** Claude Sonnet 4.5
