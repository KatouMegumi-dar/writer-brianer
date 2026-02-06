# Writer Brianer 增强持久化存储系统

## 📖 概述

Writer Brianer 现已升级为**四层持久化存储架构**，提供更可靠、更持久的数据保存方案。

## 🏗️ 存储架构

```
┌─────────────────────────────────────────────────────┐
│  第1层: 文件系统存储 (主存储) - 最可靠              │
│  位置: /data/default-user/extensions/writer-brianer/│
│  - config.json (主配置)                              │
│  - backups/ (自动备份目录，保留最近10个版本)         │
└─────────────────────────────────────────────────────┘
                    ↓ 同步
┌─────────────────────────────────────────────────────┐
│  第2层: SillyTavern扩展配置 (兼容层)                │
│  位置: settings.json → extensionSettings             │
└─────────────────────────────────────────────────────┘
                    ↓ 备份
┌─────────────────────────────────────────────────────┐
│  第3层: localStorage (快速缓存)                      │
│  用于: 快速读取、离线访问                            │
└─────────────────────────────────────────────────────┘
                    ↓ 导出
┌─────────────────────────────────────────────────────┐
│  第4层: 用户手动导出 (便携备份)                      │
│  格式: JSON文件下载到本地                            │
└─────────────────────────────────────────────────────┘
```

## ✨ 核心特性

### 1. 四层存储保障
- **文件系统存储**: 数据保存在插件目录的文件中，不受浏览器限制
- **ST配置同步**: 与SillyTavern原生配置系统保持兼容
- **localStorage缓存**: 提供快速读取和离线访问能力
- **手动导出/导入**: 用户可随时备份和迁移配置

### 2. 自动多版本备份
- 每次保存时自动创建备份
- 保留最近10个版本
- 自动清理过期备份
- 支持从任意备份恢复

### 3. 数据完整性保护
- SHA-256校验和验证
- 损坏检测和自动恢复
- 原子写入操作
- 多层降级策略

### 4. 智能加载策略
```
加载顺序:
1. 尝试从文件系统加载 → 校验完整性
2. 如果失败，尝试从备份恢复
3. 如果失败，尝试从ST配置加载
4. 如果失败，尝试从localStorage加载
5. 如果都失败，使用默认配置
```

### 5. 智能保存策略
```
保存流程:
1. 计算数据校验和
2. 保存到文件系统（主存储）
3. 创建自动备份（异步）
4. 同步到ST配置
5. 缓存到localStorage
6. 报告保存结果
```

## 🎯 使用方法

### 打开存储管理面板

在浏览器控制台执行：
```javascript
WBAP.StorageUI.showStoragePanel()
```

或者在UI中添加按钮调用此函数。

### 存储管理面板功能

1. **查看存储状态**
   - 文件系统存储状态和大小
   - ST配置状态和大小
   - localStorage使用率
   - 自动备份数量

2. **导出配置**
   - 点击"📥 导出配置"按钮
   - 自动下载JSON文件到本地
   - 文件名包含时间戳

3. **导入配置**
   - 点击"📤 导入配置"按钮
   - 选择之前导出的JSON文件
   - 确认后自动应用并保存

4. **手动创建备份**
   - 点击"💾 手动创建备份"按钮
   - 立即创建当前配置的备份

5. **从备份恢复**
   - 点击"🔄 从备份恢复"按钮
   - 自动从最新备份恢复配置
   - 如果最新备份损坏，会尝试更早的备份

6. **刷新状态**
   - 点击"🔄 刷新状态"按钮
   - 重新加载存储状态信息

## 🔧 API 使用

### 加载配置
```javascript
// 在config.js中自动调用
const { config, source } = await WBAP.PersistentStorage.loadConfig();
// source: 'filesystem' | 'backup' | 'ST' | 'localStorage' | 'default'
```

### 保存配置
```javascript
// 在config.js中自动调用
const results = await WBAP.PersistentStorage.saveConfig(config);
// results: { filesystem: boolean, ST: boolean, localStorage: boolean }
```

### 导出配置
```javascript
await WBAP.PersistentStorage.exportConfig(WBAP.mainConfig);
```

### 导入配置
```javascript
const file = /* File对象 */;
const config = await WBAP.PersistentStorage.importConfig(file);
if (config) {
    WBAP.mainConfig = config;
    await WBAP.saveConfig();
}
```

### 创建备份
```javascript
const success = await WBAP.PersistentStorage.createBackup(WBAP.mainConfig);
```

### 从备份恢复
```javascript
const config = await WBAP.PersistentStorage.restoreFromBackup();
if (config) {
    WBAP.mainConfig = config;
    await WBAP.saveConfig();
}
```

### 获取存储统计
```javascript
const stats = await WBAP.PersistentStorage.getStorageStats();
console.log(stats);
// {
//   filesystem: { available: boolean, size: number },
//   ST: { available: boolean, size: number },
//   localStorage: { available: boolean, size: number, used: number, limit: number },
//   backups: { count: number, totalSize: number }
// }
```

### 数据完整性验证
```javascript
const checksum = await WBAP.PersistentStorage.calculateChecksum(data);
const isValid = await WBAP.PersistentStorage.verifyIntegrity(data, checksum);
```

## 📁 文件结构

```
writer brianer/
├── modules/
│   ├── persistent_storage.js  # 持久化存储核心模块
│   ├── storage_ui.js          # 存储管理UI组件
│   └── config.js              # 配置管理（已集成持久化）
└── data/ (在ST数据目录中)
    └── extensions/
        └── writer-brianer/
            ├── config.json    # 主配置文件
            └── backups/       # 自动备份目录
                ├── config_2026-01-31_14-30-00.json
                └── config_2026-01-31_13-00-00.json
```

## 🛡️ 安全特性

1. **数据完整性**
   - SHA-256校验和
   - 自动损坏检测
   - 多版本备份

2. **原子操作**
   - 使用ST的原子写入API
   - 防止数据损坏

3. **降级策略**
   - 多层存储降级
   - 自动恢复机制

4. **用户控制**
   - 手动导出/导入
   - 备份管理
   - 状态监控

## 🔄 迁移说明

### 从旧版本升级

旧版本的配置会自动迁移到新的持久化系统：

1. 首次加载时，系统会检测旧配置
2. 自动从ST配置或localStorage读取
3. 迁移到新的文件系统存储
4. 创建初始备份
5. 保持向后兼容

### 跨设备迁移

1. 在原设备上导出配置
2. 将JSON文件传输到新设备
3. 在新设备上导入配置
4. 系统自动应用并保存

## ⚠️ 注意事项

1. **文件系统权限**
   - 确保SillyTavern有写入权限
   - 检查数据目录是否可访问

2. **localStorage限制**
   - 浏览器通常限制5-10MB
   - 大配置可能超出限制
   - 文件系统存储无此限制

3. **备份管理**
   - 自动保留最近10个备份
   - 旧备份会自动清理
   - 可手动创建额外备份

4. **数据同步**
   - 多个存储层会自动同步
   - 文件系统为主存储
   - 其他层为备份和缓存

## 🐛 故障排除

### 配置无法保存

1. 检查浏览器控制台错误
2. 打开存储管理面板查看状态
3. 尝试手动创建备份
4. 检查文件系统权限

### 配置丢失

1. 打开存储管理面板
2. 点击"从备份恢复"
3. 如果没有备份，尝试导入之前导出的文件

### localStorage空间不足

1. 清理浏览器缓存
2. 删除不需要的localStorage数据
3. 文件系统存储不受此限制

## 📊 性能优化

1. **异步操作**
   - 备份创建是异步的，不阻塞主流程
   - 使用防抖减少保存频率

2. **增量保存**
   - 只保存变更的数据
   - 减少写入开销

3. **缓存策略**
   - localStorage提供快速读取
   - 减少文件系统访问

## 🎉 总结

新的持久化存储系统提供了：

✅ **更可靠** - 四层存储保障，多重备份
✅ **更持久** - 文件系统存储，不受浏览器限制
✅ **更安全** - 数据完整性校验，自动恢复
✅ **更灵活** - 导出/导入，跨设备迁移
✅ **更智能** - 自动备份，智能降级

享受更安全、更可靠的数据存储体验！
