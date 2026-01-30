// modules/persistent_storage.js
// 增强的持久化存储模块 - 四层存储架构

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const EXTENSION_NAME = 'worldbook_ai_processor';
    const STORAGE_VERSION = 1;
    const MAX_BACKUPS = 10; // 保留最近10个备份

    // 存储路径配置
    const STORAGE_PATHS = {
        config: 'writer-brianer/config.json',
        backups: 'writer-brianer/backups',
        exports: 'writer-brianer/exports'
    };

    /**
     * 计算数据的SHA-256校验和
     */
    async function calculateChecksum(data) {
        try {
            const text = typeof data === 'string' ? data : JSON.stringify(data);
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(text);
            const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            Logger.error('计算校验和失败', e);
            return null;
        }
    }

    /**
     * 验证数据完整性
     */
    async function verifyIntegrity(data, expectedChecksum) {
        if (!expectedChecksum) return true;
        const actualChecksum = await calculateChecksum(data);
        return actualChecksum === expectedChecksum;
    }

    /**
     * 生成时间戳文件名
     */
    function generateTimestampFilename(prefix = 'config', ext = 'json') {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '')
            .replace('T', '_');
        return `${prefix}_${timestamp}.${ext}`;
    }

    /**
     * 从文件系统读取配置
     */
    async function readFromFileSystem(path) {
        try {
            const response = await fetch('/api/files/get', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    Logger.log(`文件不存在: ${path}`);
                    return null;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            return result;
        } catch (e) {
            Logger.error(`从文件系统读取失败: ${path}`, e);
            return null;
        }
    }

    /**
     * 写入文件系统
     */
    async function writeToFileSystem(path, data) {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: path,
                    data: base64Data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            Logger.log(`成功写入文件系统: ${path}`);
            return true;
        } catch (e) {
            Logger.error(`写入文件系统失败: ${path}`, e);
            return false;
        }
    }

    /**
     * 列出备份文件
     */
    async function listBackups() {
        try {
            const response = await fetch('/api/files/list', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: STORAGE_PATHS.backups
                })
            });

            if (!response.ok) {
                return [];
            }

            const result = await response.json();
            return result.files || [];
        } catch (e) {
            Logger.error('列出备份文件失败', e);
            return [];
        }
    }

    /**
     * 清理旧备份（保留最近N个）
     */
    async function cleanupOldBackups() {
        try {
            const backups = await listBackups();
            if (backups.length <= MAX_BACKUPS) {
                return;
            }

            // 按时间戳排序（文件名包含时间戳）
            backups.sort().reverse();

            // 删除超出限制的旧备份
            const toDelete = backups.slice(MAX_BACKUPS);
            for (const filename of toDelete) {
                const path = `${STORAGE_PATHS.backups}/${filename}`;
                await fetch('/api/files/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ path })
                });
                Logger.log(`已删除旧备份: ${filename}`);
            }
        } catch (e) {
            Logger.error('清理旧备份失败', e);
        }
    }

    /**
     * 创建备份
     */
    async function createBackup(config) {
        try {
            const filename = generateTimestampFilename('config', 'json');
            const path = `${STORAGE_PATHS.backups}/${filename}`;

            const checksum = await calculateChecksum(config);
            const backupData = {
                version: STORAGE_VERSION,
                timestamp: Date.now(),
                checksum: checksum,
                config: config
            };

            const success = await writeToFileSystem(path, backupData);
            if (success) {
                Logger.log(`备份已创建: ${filename}`);
                // 异步清理旧备份
                cleanupOldBackups().catch(e => Logger.error('清理备份失败', e));
            }
            return success;
        } catch (e) {
            Logger.error('创建备份失败', e);
            return false;
        }
    }

    /**
     * 从最新备份恢复
     */
    async function restoreFromBackup() {
        try {
            const backups = await listBackups();
            if (backups.length === 0) {
                Logger.log('没有可用的备份');
                return null;
            }

            // 按时间戳排序，获取最新的
            backups.sort().reverse();

            for (const filename of backups) {
                const path = `${STORAGE_PATHS.backups}/${filename}`;
                const backupData = await readFromFileSystem(path);

                if (!backupData || !backupData.config) {
                    Logger.warn(`备份文件损坏: ${filename}`);
                    continue;
                }

                // 验证完整性
                const isValid = await verifyIntegrity(
                    backupData.config,
                    backupData.checksum
                );

                if (!isValid) {
                    Logger.warn(`备份校验失败: ${filename}`);
                    continue;
                }

                Logger.log(`从备份恢复: ${filename}`);
                return backupData.config;
            }

            Logger.error('所有备份都已损坏');
            return null;
        } catch (e) {
            Logger.error('从备份恢复失败', e);
            return null;
        }
    }

    /**
     * 四层加载策略
     */
    async function loadConfig() {
        let config = null;
        let source = 'default';

        // 第1层: 尝试从文件系统加载
        try {
            const fileData = await readFromFileSystem(STORAGE_PATHS.config);
            if (fileData && fileData.config) {
                // 验证完整性
                const isValid = await verifyIntegrity(
                    fileData.config,
                    fileData.checksum
                );

                if (isValid) {
                    config = fileData.config;
                    source = 'filesystem';
                    Logger.log('✓ 从文件系统加载配置');
                } else {
                    Logger.warn('文件系统配置校验失败，尝试从备份恢复');
                    config = await restoreFromBackup();
                    if (config) {
                        source = 'backup';
                        Logger.log('✓ 从备份恢复配置');
                    }
                }
            }
        } catch (e) {
            Logger.error('从文件系统加载失败', e);
        }

        // 第2层: 尝试从SillyTavern扩展配置加载
        if (!config && typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            try {
                const { extensionSettings } = SillyTavern.getContext();
                if (extensionSettings && extensionSettings[EXTENSION_NAME]) {
                    config = extensionSettings[EXTENSION_NAME];
                    source = 'ST';
                    Logger.log('✓ 从SillyTavern配置加载');
                }
            } catch (e) {
                Logger.error('从ST配置加载失败', e);
            }
        }

        // 第3层: 尝试从localStorage加载
        if (!config) {
            try {
                const backupStr = localStorage.getItem(`${EXTENSION_NAME}_backup`);
                if (backupStr) {
                    const backup = JSON.parse(backupStr);
                    if (backup && backup.config) {
                        config = backup.config;
                        source = 'localStorage';
                        Logger.log('✓ 从localStorage恢复配置');
                    }
                }
            } catch (e) {
                Logger.error('从localStorage加载失败', e);
            }
        }

        // 第4层: 使用默认配置
        if (!config || !config.characterConfigs) {
            config = WBAP.createDefaultMainConfig();
            source = 'default';
            Logger.log('✓ 使用默认配置');
        }

        Logger.log(`配置加载完成，来源: ${source}`);
        return { config, source };
    }

    /**
     * 四层保存策略
     */
    async function saveConfig(config) {
        const results = {
            filesystem: false,
            ST: false,
            localStorage: false,
            backup: false
        };

        // 计算校验和
        const checksum = await calculateChecksum(config);
        const wrappedData = {
            version: STORAGE_VERSION,
            timestamp: Date.now(),
            checksum: checksum,
            config: config
        };

        // 第1层: 保存到文件系统（主存储）
        try {
            results.filesystem = await writeToFileSystem(
                STORAGE_PATHS.config,
                wrappedData
            );
            if (results.filesystem) {
                Logger.log('✓ 已保存到文件系统');
            }
        } catch (e) {
            Logger.error('保存到文件系统失败', e);
        }

        // 创建备份（异步，不阻塞）
        if (results.filesystem) {
            createBackup(config).catch(e => Logger.error('创建备份失败', e));
        }

        // 第2层: 保存到SillyTavern配置
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
                if (extensionSettings) {
                    extensionSettings[EXTENSION_NAME] = config;
                    if (typeof saveSettingsDebounced === 'function') {
                        saveSettingsDebounced();
                        results.ST = true;
                        Logger.log('✓ 已保存到ST配置');
                    }
                }
            }
        } catch (e) {
            Logger.error('保存到ST配置失败', e);
        }

        // 第3层: 保存到localStorage（快速缓存）
        try {
            const backup = {
                version: STORAGE_VERSION,
                timestamp: Date.now(),
                config: config
            };
            localStorage.setItem(`${EXTENSION_NAME}_backup`, JSON.stringify(backup));
            localStorage.setItem(`${EXTENSION_NAME}_backup_version`, String(STORAGE_VERSION));
            results.localStorage = true;
            Logger.log('✓ 已保存到localStorage');
        } catch (e) {
            Logger.error('保存到localStorage失败', e);
            if (e.name === 'QuotaExceededError') {
                Logger.warn('localStorage空间不足，尝试清理');
                // 可以在这里实现清理逻辑
            }
        }

        // 检查保存结果
        const successCount = Object.values(results).filter(Boolean).length;
        if (successCount === 0) {
            Logger.error('所有存储层保存失败！');
            if (window.toastr) {
                toastr.error('配置保存失败，请检查权限', '错误');
            }
        } else if (successCount < 3) {
            Logger.warn(`部分存储层保存失败 (${successCount}/3)`);
        } else {
            Logger.log(`配置已保存到 ${successCount} 个存储层`);
        }

        return results;
    }

    /**
     * 导出配置到用户下载
     */
    async function exportConfig(config) {
        try {
            const checksum = await calculateChecksum(config);
            const exportData = {
                version: STORAGE_VERSION,
                timestamp: Date.now(),
                checksum: checksum,
                exportedBy: 'Writer Brianer',
                config: config
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const filename = generateTimestampFilename('writer-brianer-export', 'json');
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Logger.log(`配置已导出: ${filename}`);
            if (window.toastr) {
                toastr.success(`配置已导出: ${filename}`, '导出成功');
            }
            return true;
        } catch (e) {
            Logger.error('导出配置失败', e);
            if (window.toastr) {
                toastr.error('导出配置失败', '错误');
            }
            return false;
        }
    }

    /**
     * 从用户上传导入配置
     */
    async function importConfig(file) {
        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (!importData.config) {
                throw new Error('无效的配置文件格式');
            }

            // 验证完整性
            const isValid = await verifyIntegrity(
                importData.config,
                importData.checksum
            );

            if (!isValid) {
                Logger.warn('导入文件校验失败，但仍将尝试导入');
                if (window.toastr) {
                    toastr.warning('文件校验失败，数据可能已损坏', '警告');
                }
            }

            Logger.log('配置导入成功');
            if (window.toastr) {
                toastr.success('配置导入成功，正在保存...', '导入成功');
            }

            return importData.config;
        } catch (e) {
            Logger.error('导入配置失败', e);
            if (window.toastr) {
                toastr.error('导入配置失败: ' + e.message, '错误');
            }
            return null;
        }
    }

    /**
     * 获取存储统计信息
     */
    async function getStorageStats() {
        const stats = {
            filesystem: { available: false, size: 0 },
            ST: { available: false, size: 0 },
            localStorage: { available: false, size: 0, used: 0, limit: 0 },
            backups: { count: 0, totalSize: 0 }
        };

        // 检查文件系统
        try {
            const fileData = await readFromFileSystem(STORAGE_PATHS.config);
            if (fileData) {
                stats.filesystem.available = true;
                stats.filesystem.size = JSON.stringify(fileData).length;
            }
        } catch (e) {
            // 忽略
        }

        // 检查ST配置
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const { extensionSettings } = SillyTavern.getContext();
                if (extensionSettings && extensionSettings[EXTENSION_NAME]) {
                    stats.ST.available = true;
                    stats.ST.size = JSON.stringify(extensionSettings[EXTENSION_NAME]).length;
                }
            }
        } catch (e) {
            // 忽略
        }

        // 检查localStorage
        try {
            const backup = localStorage.getItem(`${EXTENSION_NAME}_backup`);
            if (backup) {
                stats.localStorage.available = true;
                stats.localStorage.size = backup.length;
            }

            // 估算localStorage使用情况
            let totalSize = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length + key.length;
                }
            }
            stats.localStorage.used = totalSize;
            stats.localStorage.limit = 5 * 1024 * 1024; // 假设5MB限制
        } catch (e) {
            // 忽略
        }

        // 检查备份
        try {
            const backups = await listBackups();
            stats.backups.count = backups.length;
        } catch (e) {
            // 忽略
        }

        return stats;
    }

    // 导出API
    window.WBAP.PersistentStorage = {
        loadConfig,
        saveConfig,
        exportConfig,
        importConfig,
        getStorageStats,
        createBackup,
        restoreFromBackup,
        calculateChecksum,
        verifyIntegrity
    };

    Logger.log('持久化存储模块已加载');

})();
