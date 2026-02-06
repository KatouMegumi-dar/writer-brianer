// modules/persistent_storage.js
// 增强的持久化存储模块 - 八层索引化存储架构 v3.0

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const EXTENSION_NAME = 'worldbook_ai_processor';
    const STORAGE_VERSION = 3;
    const MAX_BACKUPS = 30;      // 保留最近30个备份
    const MAX_LOG_ENTRIES = 200; // 保留最近200条日志
    const EMERGENCY_BACKUP_INTERVAL = 30 * 60 * 1000; // 30分钟创建一次紧急备份

    // IndexedDB 配置
    const IDB_NAME = 'WriterBrianerDB';
    const IDB_VERSION = 1;
    const IDB_STORE = 'config';

    // 存储文件配置
    const STORAGE_FILES = {
        data: 'writer-brianer-data.json',           // 主配置数据
        backupIndex: 'writer-brianer-backup-index.json', // 备份索引（元数据）
        meta: 'writer-brianer-meta.json',           // 元数据索引
        cache: 'writer-brianer-cache.json',         // 缓存数据
        log: 'writer-brianer-log.json',             // 操作日志
        emergency: 'writer-brianer-emergency.json', // 紧急备份（独立文件）
        refresh: 'writer-brianer-refresh.json'      // 页面刷新备份（最后保底）
    };

    // 备份文件前缀
    const BACKUP_FILE_PREFIX = 'writer-brianer-bak-';

    // 旧版文件（用于迁移）
    const LEGACY_FILES = {
        config: 'writer-brianer-config.json',
        backups: 'writer-brianer-backups.json',     // v2.x 的合并备份文件
        backupPattern: /^writer-brianer-backup-\d+\.json$/
    };

    // 紧急备份定时器
    let emergencyBackupTimer = null;
    let lastEmergencyBackupTime = 0;

    // 页面刷新备份标记
    let refreshBackupRegistered = false;

    // ==================== 工具函数 ====================

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
     * 获取请求头（包含CSRF token）
     */
    function getRequestHeaders() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx?.getRequestHeaders === 'function') {
                    return ctx.getRequestHeaders();
                }
            }
        } catch (e) { /* ignore */ }

        if (typeof window !== 'undefined' && typeof window.getRequestHeaders === 'function') {
            try {
                return window.getRequestHeaders();
            } catch (e) { /* ignore */ }
        }
        return { 'Content-Type': 'application/json' };
    }

    /**
     * 生成时间戳文件名
     */
    function generateTimestampFilename(prefix = 'export', ext = 'json') {
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '')
            .replace('T', '_');
        return `${prefix}_${timestamp}.${ext}`;
    }

    // ==================== 文件系统操作 ====================

    /**
     * 从文件系统读取
     */
    async function readFile(filename) {
        try {
            const url = `/user/files/${filename}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: getRequestHeaders(),
                cache: 'no-store'
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (e) {
            if (!e.message?.includes('404')) {
                Logger.error(`读取文件失败: ${filename}`, e);
            }
            return null;
        }
    }

    /**
     * 写入文件系统
     */
    async function writeFile(filename, data) {
        try {
            const jsonString = JSON.stringify(data, null, 2);
            const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

            const response = await fetch('/api/files/upload', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    name: filename,
                    data: base64Data
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return true;
        } catch (e) {
            Logger.error(`写入文件失败: ${filename}`, e);
            return false;
        }
    }

    /**
     * 删除文件
     */
    async function deleteFile(filename) {
        try {
            const response = await fetch('/api/files/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ path: `/user/files/${filename}` })
            });
            return response.ok;
        } catch (e) {
            Logger.warn(`删除文件失败: ${filename}`, e);
            return false;
        }
    }

    // ==================== IndexedDB 操作 (第4层存储) ====================

    let idbInstance = null;

    /**
     * 打开 IndexedDB 数据库
     */
    function openIndexedDB() {
        return new Promise((resolve, reject) => {
            if (idbInstance) {
                resolve(idbInstance);
                return;
            }

            if (!window.indexedDB) {
                reject(new Error('IndexedDB 不可用'));
                return;
            }

            const request = indexedDB.open(IDB_NAME, IDB_VERSION);

            request.onerror = () => {
                reject(request.error);
            };

            request.onsuccess = () => {
                idbInstance = request.result;
                resolve(idbInstance);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * 保存到 IndexedDB
     */
    async function saveToIndexedDB(config) {
        try {
            const db = await openIndexedDB();
            const checksum = await calculateChecksum(config);

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([IDB_STORE], 'readwrite');
                const store = transaction.objectStore(IDB_STORE);

                const data = {
                    key: 'main_config',
                    version: STORAGE_VERSION,
                    timestamp: Date.now(),
                    checksum: checksum,
                    config: config
                };

                const request = store.put(data);

                request.onsuccess = () => {
                    Logger.log('✓ 已保存到IndexedDB');
                    resolve(true);
                };

                request.onerror = () => {
                    Logger.error('保存到IndexedDB失败', request.error);
                    reject(request.error);
                };
            });
        } catch (e) {
            Logger.error('IndexedDB保存失败', e);
            return false;
        }
    }

    /**
     * 从 IndexedDB 加载
     */
    async function loadFromIndexedDB() {
        try {
            const db = await openIndexedDB();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction([IDB_STORE], 'readonly');
                const store = transaction.objectStore(IDB_STORE);
                const request = store.get('main_config');

                request.onsuccess = () => {
                    const data = request.result;
                    if (data && data.config) {
                        resolve(data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (e) {
            Logger.error('从IndexedDB加载失败', e);
            return null;
        }
    }

    // ==================== 元数据管理 ====================

    /**
     * 创建/更新元数据
     */
    async function updateMeta(config) {
        const checksum = await calculateChecksum(config);
        const meta = {
            version: STORAGE_VERSION,
            lastModified: Date.now(),
            checksum: checksum,
            files: {
                data: STORAGE_FILES.data,
                backups: STORAGE_FILES.backups,
                cache: STORAGE_FILES.cache,
                log: STORAGE_FILES.log
            },
            stats: {
                characterCount: Object.keys(config?.characterConfigs || {}).length,
                endpointCount: (config?.globalPools?.selectiveMode?.apiEndpoints?.length || 0) +
                               (config?.globalPools?.memory?.apiEndpoints?.length || 0)
            }
        };

        await writeFile(STORAGE_FILES.meta, meta);
        return meta;
    }

    /**
     * 读取元数据
     */
    async function readMeta() {
        return await readFile(STORAGE_FILES.meta);
    }

    // ==================== 日志管理 ====================

    let logBuffer = [];
    let logFlushTimer = null;

    /**
     * 添加日志条目
     */
    function addLogEntry(action, details = {}) {
        const entry = {
            timestamp: Date.now(),
            action: action,
            details: details
        };

        logBuffer.push(entry);

        // 防抖写入日志
        if (logFlushTimer) clearTimeout(logFlushTimer);
        logFlushTimer = setTimeout(() => flushLog(), 5000);
    }

    /**
     * 刷新日志到文件
     */
    async function flushLog() {
        if (logBuffer.length === 0) return;

        try {
            let logData = await readFile(STORAGE_FILES.log) || { entries: [] };

            // 合并新日志
            logData.entries = [...logData.entries, ...logBuffer];

            // 保留最近的条目
            if (logData.entries.length > MAX_LOG_ENTRIES) {
                logData.entries = logData.entries.slice(-MAX_LOG_ENTRIES);
            }

            logData.lastUpdated = Date.now();
            await writeFile(STORAGE_FILES.log, logData);

            logBuffer = [];
        } catch (e) {
            Logger.error('刷新日志失败', e);
        }
    }

    /**
     * 读取日志
     */
    async function readLog() {
        return await readFile(STORAGE_FILES.log) || { entries: [] };
    }

    /**
     * 清空日志
     */
    async function clearLog() {
        logBuffer = [];
        await writeFile(STORAGE_FILES.log, { entries: [], lastUpdated: Date.now() });
        addLogEntry('LOG_CLEARED');
    }

    // ==================== 缓存管理 ====================

    /**
     * 读取缓存
     */
    async function readCache() {
        return await readFile(STORAGE_FILES.cache) || {
            prompts: null,
            worldBooks: null,
            lastUpdated: null
        };
    }

    /**
     * 更新缓存
     */
    async function updateCache(key, value) {
        try {
            let cache = await readCache();
            cache[key] = value;
            cache.lastUpdated = Date.now();
            await writeFile(STORAGE_FILES.cache, cache);
            addLogEntry('CACHE_UPDATED', { key });
            return true;
        } catch (e) {
            Logger.error('更新缓存失败', e);
            return false;
        }
    }

    /**
     * 清空缓存
     */
    async function clearCache() {
        await writeFile(STORAGE_FILES.cache, {
            prompts: null,
            worldBooks: null,
            lastUpdated: Date.now()
        });
        addLogEntry('CACHE_CLEARED');
    }

    // ==================== 备份管理（索引化独立文件存储 v3.0）====================

    /**
     * 生成备份文件名
     * @param {number} id - 备份ID
     */
    function getBackupFileName(id) {
        return `${BACKUP_FILE_PREFIX}${String(id).padStart(4, '0')}.json`;
    }

    /**
     * 读取备份索引
     */
    async function readBackupIndex() {
        const index = await readFile(STORAGE_FILES.backupIndex);
        return index || {
            version: STORAGE_VERSION,
            nextId: 1,
            entries: [],  // { id, filename, timestamp, checksum, reason, size }
            lastUpdated: Date.now()
        };
    }

    /**
     * 保存备份索引
     */
    async function saveBackupIndex(index) {
        index.lastUpdated = Date.now();
        return await writeFile(STORAGE_FILES.backupIndex, index);
    }

    /**
     * 创建备份（独立文件存储）
     */
    async function createBackup(config, reason = 'manual') {
        try {
            const index = await readBackupIndex();
            const checksum = await calculateChecksum(config);
            const timestamp = Date.now();
            const backupId = index.nextId;
            const filename = getBackupFileName(backupId);

            // 创建备份数据
            const backupData = {
                version: STORAGE_VERSION,
                id: backupId,
                timestamp: timestamp,
                checksum: checksum,
                reason: reason,
                config: config
            };

            // 写入独立备份文件
            const success = await writeFile(filename, backupData);

            if (success) {
                // 计算文件大小
                const size = JSON.stringify(backupData).length;

                // 更新索引
                index.entries.push({
                    id: backupId,
                    filename: filename,
                    timestamp: timestamp,
                    checksum: checksum,
                    reason: reason,
                    size: size
                });
                index.nextId = backupId + 1;

                // 清理超出限制的旧备份
                await cleanupOldBackups(index);

                // 保存索引
                await saveBackupIndex(index);

                addLogEntry('BACKUP_CREATED', {
                    id: backupId,
                    reason,
                    checksum: checksum?.slice(0, 8),
                    filename
                });
                Logger.log(`✓ 备份已创建: ${filename} (${reason})`);
            }

            return success;
        } catch (e) {
            Logger.error('创建备份失败', e);
            return false;
        }
    }

    /**
     * 清理超出限制的旧备份
     */
    async function cleanupOldBackups(index) {
        while (index.entries.length > MAX_BACKUPS) {
            const oldest = index.entries.shift();
            if (oldest) {
                try {
                    await deleteFile(oldest.filename);
                    Logger.log(`✓ 已删除旧备份: ${oldest.filename}`);
                } catch (e) {
                    Logger.warn(`删除旧备份失败: ${oldest.filename}`, e);
                }
            }
        }
    }

    /**
     * 从备份恢复
     * @param {number} id - 备份ID，-1 表示最新备份
     */
    async function restoreFromBackup(id = -1) {
        try {
            const index = await readBackupIndex();

            if (!index.entries || index.entries.length === 0) {
                Logger.warn('没有可用的备份');
                return null;
            }

            // 查找目标备份
            let targetEntry;
            if (id < 0) {
                // 负数索引：-1 表示最新，-2 表示倒数第二...
                const targetIndex = index.entries.length + id;
                if (targetIndex < 0 || targetIndex >= index.entries.length) {
                    Logger.error('无效的备份索引');
                    return null;
                }
                targetEntry = index.entries[targetIndex];
            } else {
                // 按ID查找
                targetEntry = index.entries.find(e => e.id === id);
                if (!targetEntry) {
                    Logger.error(`找不到ID为 ${id} 的备份`);
                    return null;
                }
            }

            // 读取备份文件
            const backupData = await readFile(targetEntry.filename);
            if (!backupData || !backupData.config) {
                Logger.error(`备份文件损坏: ${targetEntry.filename}`);
                return null;
            }

            // 验证完整性
            const isValid = await verifyIntegrity(backupData.config, backupData.checksum);
            if (!isValid) {
                Logger.warn('备份校验失败，数据可能已损坏');
            }

            addLogEntry('BACKUP_RESTORED', {
                id: targetEntry.id,
                filename: targetEntry.filename,
                timestamp: targetEntry.timestamp
            });

            Logger.log(`✓ 从备份恢复: ${targetEntry.filename}`);
            return backupData.config;
        } catch (e) {
            Logger.error('从备份恢复失败', e);
            return null;
        }
    }

    /**
     * 列出所有备份（仅元数据，不加载配置内容）
     */
    async function listBackups() {
        const index = await readBackupIndex();
        return (index.entries || []).map(e => ({
            id: e.id,
            filename: e.filename,
            timestamp: e.timestamp,
            reason: e.reason,
            checksum: e.checksum?.slice(0, 8),
            size: e.size,
            sizeFormatted: formatSize(e.size)
        }));
    }

    /**
     * 获取单个备份详情（包含配置内容）
     */
    async function getBackupById(id) {
        const index = await readBackupIndex();
        const entry = index.entries.find(e => e.id === id);

        if (!entry) {
            return null;
        }

        const backupData = await readFile(entry.filename);
        return backupData;
    }

    /**
     * 删除指定备份
     */
    async function deleteBackup(id) {
        try {
            const index = await readBackupIndex();
            const entryIndex = index.entries.findIndex(e => e.id === id);

            if (entryIndex === -1) {
                Logger.warn(`找不到ID为 ${id} 的备份`);
                return false;
            }

            const entry = index.entries[entryIndex];

            // 删除备份文件
            await deleteFile(entry.filename);

            // 从索引中移除
            index.entries.splice(entryIndex, 1);
            await saveBackupIndex(index);

            addLogEntry('BACKUP_DELETED', { id, filename: entry.filename });
            Logger.log(`✓ 已删除备份: ${entry.filename}`);

            return true;
        } catch (e) {
            Logger.error('删除备份失败', e);
            return false;
        }
    }

    /**
     * 格式化文件大小
     */
    function formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let size = bytes;
        while (size >= 1024 && i < units.length - 1) {
            size /= 1024;
            i++;
        }
        return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
    }

    /**
     * 从旧版备份格式迁移到新版（v2.x -> v3.0）
     */
    async function migrateBackupsFromV2() {
        try {
            // 检查是否存在旧版合并备份文件
            const oldBackups = await readFile(LEGACY_FILES.backups);
            if (!oldBackups || !oldBackups.history || oldBackups.history.length === 0) {
                return false;
            }

            Logger.log(`检测到旧版备份格式，开始迁移 ${oldBackups.history.length} 个备份...`);

            const index = await readBackupIndex();

            // 迁移每个备份到独立文件
            for (const backup of oldBackups.history) {
                const backupId = index.nextId;
                const filename = getBackupFileName(backupId);

                const backupData = {
                    version: STORAGE_VERSION,
                    id: backupId,
                    timestamp: backup.timestamp,
                    checksum: backup.checksum,
                    reason: backup.reason || 'migrated_from_v2',
                    config: backup.config
                };

                const success = await writeFile(filename, backupData);
                if (success) {
                    index.entries.push({
                        id: backupId,
                        filename: filename,
                        timestamp: backup.timestamp,
                        checksum: backup.checksum,
                        reason: backup.reason || 'migrated_from_v2',
                        size: JSON.stringify(backupData).length
                    });
                    index.nextId = backupId + 1;
                    Logger.log(`  ✓ 迁移备份 ${backupId}: ${filename}`);
                }
            }

            // 保存新索引
            await saveBackupIndex(index);

            // 删除旧版合并备份文件
            await deleteFile(LEGACY_FILES.backups);

            addLogEntry('BACKUPS_MIGRATED_FROM_V2', {
                count: oldBackups.history.length
            });

            Logger.log(`✓ 备份迁移完成，共迁移 ${oldBackups.history.length} 个备份`);
            return true;
        } catch (e) {
            Logger.error('备份迁移失败', e);
            return false;
        }
    }

    /**
     * 创建紧急备份（独立文件，最后防线）
     */
    async function createEmergencyBackup(config) {
        try {
            const now = Date.now();

            // 检查是否需要创建（间隔30分钟）
            if (now - lastEmergencyBackupTime < EMERGENCY_BACKUP_INTERVAL) {
                return false;
            }

            const checksum = await calculateChecksum(config);
            const emergencyData = {
                version: STORAGE_VERSION,
                timestamp: now,
                checksum: checksum,
                reason: 'emergency',
                config: config
            };

            const success = await writeFile(STORAGE_FILES.emergency, emergencyData);

            if (success) {
                lastEmergencyBackupTime = now;
                addLogEntry('EMERGENCY_BACKUP_CREATED', { checksum: checksum?.slice(0, 8) });
                Logger.log('✓ 紧急备份已创建');
            }

            return success;
        } catch (e) {
            Logger.error('创建紧急备份失败', e);
            return false;
        }
    }

    /**
     * 从紧急备份恢复
     */
    async function restoreFromEmergencyBackup() {
        try {
            const emergencyData = await readFile(STORAGE_FILES.emergency);

            if (!emergencyData || !emergencyData.config) {
                Logger.warn('没有可用的紧急备份');
                return null;
            }

            // 验证完整性
            const isValid = await verifyIntegrity(emergencyData.config, emergencyData.checksum);
            if (!isValid) {
                Logger.warn('紧急备份校验失败');
            }

            addLogEntry('EMERGENCY_BACKUP_RESTORED', {
                timestamp: emergencyData.timestamp
            });

            Logger.log('✓ 从紧急备份恢复');
            return emergencyData.config;
        } catch (e) {
            Logger.error('从紧急备份恢复失败', e);
            return null;
        }
    }

    /**
     * 启动紧急备份定时器
     */
    function startEmergencyBackupTimer() {
        if (emergencyBackupTimer) {
            clearInterval(emergencyBackupTimer);
        }

        emergencyBackupTimer = setInterval(async () => {
            const config = WBAP.mainConfig;
            if (config) {
                await createEmergencyBackup(config);
            }
        }, EMERGENCY_BACKUP_INTERVAL);

        Logger.log('紧急备份定时器已启动（30分钟间隔）');
    }

    // ==================== 页面刷新备份 ====================

    // 刷新备份节流控制
    let lastRefreshBackupTime = 0;
    const REFRESH_BACKUP_THROTTLE = 5000; // 5秒节流间隔

    /**
     * 创建页面刷新备份（同步方式，用于 beforeunload）
     * 使用 localStorage 作为中转，因为 beforeunload 中无法可靠执行异步操作
     * @param {boolean} force - 是否强制写入（忽略节流）
     */
    function createRefreshBackupSync(force = false) {
        try {
            const config = WBAP.mainConfig;
            if (!config || !config.characterConfigs) {
                return false;
            }

            // 节流检查（非强制模式下）
            const now = Date.now();
            if (!force && (now - lastRefreshBackupTime) < REFRESH_BACKUP_THROTTLE) {
                return false;
            }

            const refreshData = {
                version: STORAGE_VERSION,
                timestamp: now,
                reason: 'page_refresh',
                config: config
            };

            // 尝试写入 localStorage
            try {
                const jsonStr = JSON.stringify(refreshData);

                // 检查大小（localStorage 通常限制 5MB）
                const sizeInMB = jsonStr.length / (1024 * 1024);
                if (sizeInMB > 4.5) {
                    Logger.warn(`配置过大 (${sizeInMB.toFixed(2)}MB)，尝试精简备份`);
                    // 降级：只保存核心配置
                    const minimalData = {
                        version: STORAGE_VERSION,
                        timestamp: now,
                        reason: 'page_refresh_minimal',
                        config: {
                            characterConfigs: config.characterConfigs,
                            globalSettings: config.globalSettings,
                            globalPools: config.globalPools ? {
                                globalJailbreak: config.globalPools.globalJailbreak,
                                selectiveMode: config.globalPools.selectiveMode,
                                // 省略大型提示词池以减小体积
                                prompts: { main: config.globalPools.prompts?.main || [] }
                            } : null
                        }
                    };
                    localStorage.setItem(`${EXTENSION_NAME}_refresh_backup`, JSON.stringify(minimalData));
                    Logger.log('✓ 页面刷新备份已保存（精简模式）');
                } else {
                    localStorage.setItem(`${EXTENSION_NAME}_refresh_backup`, jsonStr);
                    Logger.log('✓ 页面刷新备份已保存到 localStorage');
                }

                lastRefreshBackupTime = now;
                return true;
            } catch (storageError) {
                // localStorage 写入失败，尝试降级方案
                if (storageError.name === 'QuotaExceededError' ||
                    storageError.message.includes('quota')) {
                    Logger.warn('localStorage 空间不足，尝试清理后重试');

                    // 清理旧数据后重试
                    try {
                        localStorage.removeItem(`${EXTENSION_NAME}_refresh_backup`);
                        localStorage.removeItem(`${EXTENSION_NAME}_backup`);

                        // 只保存最小必要数据
                        const emergencyData = {
                            version: STORAGE_VERSION,
                            timestamp: now,
                            reason: 'emergency_minimal',
                            config: {
                                characterConfigs: config.characterConfigs,
                                globalSettings: config.globalSettings
                            }
                        };
                        localStorage.setItem(`${EXTENSION_NAME}_refresh_backup`, JSON.stringify(emergencyData));
                        Logger.log('✓ 页面刷新备份已保存（紧急精简模式）');
                        lastRefreshBackupTime = now;
                        return true;
                    } catch (retryError) {
                        Logger.error('localStorage 写入彻底失败', retryError);
                        return false;
                    }
                }
                throw storageError;
            }
        } catch (e) {
            Logger.error('创建页面刷新备份失败', e);
            return false;
        }
    }

    /**
     * 将 localStorage 中的刷新备份持久化到文件系统
     * 在页面加载时调用
     */
    async function persistRefreshBackup() {
        try {
            const backupStr = localStorage.getItem(`${EXTENSION_NAME}_refresh_backup`);
            if (!backupStr) {
                return false;
            }

            const refreshData = JSON.parse(backupStr);
            if (!refreshData || !refreshData.config) {
                return false;
            }

            // 计算校验和
            const checksum = await calculateChecksum(refreshData.config);
            refreshData.checksum = checksum;

            // 写入文件系统
            const success = await writeFile(STORAGE_FILES.refresh, refreshData);
            if (success) {
                addLogEntry('REFRESH_BACKUP_PERSISTED', {
                    timestamp: refreshData.timestamp,
                    checksum: checksum?.slice(0, 8)
                });
                Logger.log('✓ 页面刷新备份已持久化到文件系统');
            }

            return success;
        } catch (e) {
            Logger.error('持久化页面刷新备份失败', e);
            return false;
        }
    }

    /**
     * 清理旧的页面刷新备份
     * 在新备份创建成功后调用
     */
    async function cleanupOldRefreshBackup() {
        try {
            // 清理 localStorage 中的临时备份
            localStorage.removeItem(`${EXTENSION_NAME}_refresh_backup`);
            Logger.log('✓ 已清理 localStorage 中的刷新备份');
        } catch (e) {
            Logger.error('清理旧刷新备份失败', e);
        }
    }

    /**
     * 从页面刷新备份恢复
     */
    async function restoreFromRefreshBackup() {
        try {
            // 优先从文件系统读取
            let refreshData = await readFile(STORAGE_FILES.refresh);

            // 如果文件系统没有，尝试从 localStorage 读取
            if (!refreshData || !refreshData.config) {
                const backupStr = localStorage.getItem(`${EXTENSION_NAME}_refresh_backup`);
                if (backupStr) {
                    refreshData = JSON.parse(backupStr);
                }
            }

            if (!refreshData || !refreshData.config) {
                Logger.warn('没有可用的页面刷新备份');
                return null;
            }

            // 验证完整性（如果有校验和）
            if (refreshData.checksum) {
                const isValid = await verifyIntegrity(refreshData.config, refreshData.checksum);
                if (!isValid) {
                    Logger.warn('页面刷新备份校验失败');
                }
            }

            addLogEntry('REFRESH_BACKUP_RESTORED', {
                timestamp: refreshData.timestamp
            });

            Logger.log('✓ 从页面刷新备份恢复');
            return refreshData.config;
        } catch (e) {
            Logger.error('从页面刷新备份恢复失败', e);
            return null;
        }
    }

    /**
     * 注册页面刷新备份事件
     */
    function registerRefreshBackup() {
        if (refreshBackupRegistered) {
            return;
        }

        // beforeunload 事件 - 页面刷新/关闭前触发（强制写入，忽略节流）
        window.addEventListener('beforeunload', () => {
            createRefreshBackupSync(true);
        });

        // pagehide 事件 - 更可靠的页面离开检测（移动端友好，强制写入）
        window.addEventListener('pagehide', () => {
            createRefreshBackupSync(true);
        });

        // visibilitychange 事件 - 页面隐藏时备份（受节流控制，避免频繁写入）
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                createRefreshBackupSync(false); // 非强制，受节流控制
            }
        });

        refreshBackupRegistered = true;
        Logger.log('✓ 页面刷新备份事件已注册（节流间隔: 5秒）');
    }

    /**
     * 初始化页面刷新备份系统
     * 在配置加载完成后调用
     */
    async function initRefreshBackupSystem() {
        // 1. 先将上次的 localStorage 备份持久化到文件系统
        await persistRefreshBackup();

        // 2. 清理 localStorage 中的临时备份（已持久化）
        await cleanupOldRefreshBackup();

        // 3. 注册新的备份事件
        registerRefreshBackup();

        Logger.log('✓ 页面刷新备份系统已初始化');
    }

    // ==================== 主配置管理 ====================

    /**
     * 加载配置（八层策略）
     */
    async function loadConfig() {
        let config = null;
        let source = 'default';

        // 首先尝试迁移旧版备份格式
        await migrateBackupsFromV2();

        // 第1层: 从文件系统加载
        try {
            const dataFile = await readFile(STORAGE_FILES.data);
            if (dataFile && dataFile.config) {
                const isValid = await verifyIntegrity(dataFile.config, dataFile.checksum);
                if (isValid) {
                    config = dataFile.config;
                    source = 'filesystem';
                    Logger.log('✓ 从文件系统加载配置');
                } else {
                    Logger.warn('配置校验失败，尝试从备份恢复');
                    config = await restoreFromBackup();
                    if (config) {
                        source = 'backup';
                    }
                }
            }
        } catch (e) {
            Logger.error('从文件系统加载失败', e);
        }

        // 第2层: 尝试迁移旧格式
        if (!config) {
            config = await migrateFromLegacy();
            if (config) {
                source = 'migrated';
                Logger.log('✓ 从旧格式迁移配置');
            }
        }

        // 第3层: 从SillyTavern扩展配置加载
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

        // 第4层: 从IndexedDB加载
        if (!config) {
            try {
                const idbData = await loadFromIndexedDB();
                if (idbData && idbData.config) {
                    const isValid = await verifyIntegrity(idbData.config, idbData.checksum);
                    if (isValid) {
                        config = idbData.config;
                        source = 'IndexedDB';
                        Logger.log('✓ 从IndexedDB加载配置');
                    }
                }
            } catch (e) {
                Logger.error('从IndexedDB加载失败', e);
            }
        }

        // 第5层: 从localStorage加载
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

        // 第6层: 从紧急备份恢复
        if (!config) {
            config = await restoreFromEmergencyBackup();
            if (config) {
                source = 'emergency';
                Logger.log('✓ 从紧急备份恢复配置');
            }
        }

        // 第7层: 从页面刷新备份恢复（最后保底）
        if (!config) {
            config = await restoreFromRefreshBackup();
            if (config) {
                source = 'refresh_backup';
                Logger.log('✓ 从页面刷新备份恢复配置');
            }
        }

        // 第8层: 使用默认配置
        if (!config || !config.characterConfigs) {
            config = WBAP.createDefaultMainConfig();
            source = 'default';
            Logger.log('✓ 使用默认配置');
        }

        // 启动紧急备份定时器
        startEmergencyBackupTimer();

        // 初始化页面刷新备份系统
        initRefreshBackupSystem();

        addLogEntry('CONFIG_LOADED', { source });
        Logger.log(`配置加载完成，来源: ${source}`);
        return { config, source };
    }

    /**
     * 保存配置（四层策略）
     */
    async function saveConfig(config) {
        const results = {
            filesystem: false,
            ST: false,
            indexedDB: false,
            localStorage: false
        };

        const checksum = await calculateChecksum(config);
        const wrappedData = {
            version: STORAGE_VERSION,
            timestamp: Date.now(),
            checksum: checksum,
            config: config
        };

        // 第1层: 保存到文件系统
        try {
            results.filesystem = await writeFile(STORAGE_FILES.data, wrappedData);
            if (results.filesystem) {
                Logger.log('✓ 已保存到文件系统');
                // 更新元数据
                await updateMeta(config);
                // 创建备份（异步）
                createBackup(config, 'auto_save').catch(e => Logger.error('创建备份失败', e));
            }
        } catch (e) {
            Logger.error('保存到文件系统失败', e);
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

        // 第3层: 保存到IndexedDB
        try {
            results.indexedDB = await saveToIndexedDB(config);
        } catch (e) {
            Logger.error('保存到IndexedDB失败', e);
        }

        // 第4层: 保存到localStorage
        try {
            const backup = {
                version: STORAGE_VERSION,
                timestamp: Date.now(),
                config: config
            };
            localStorage.setItem(`${EXTENSION_NAME}_backup`, JSON.stringify(backup));
            results.localStorage = true;
            Logger.log('✓ 已保存到localStorage');
        } catch (e) {
            Logger.error('保存到localStorage失败', e);
        }

        // 紧急备份（异步，不阻塞，30分钟间隔）
        createEmergencyBackup(config).catch(e => Logger.error('创建紧急备份失败', e));

        // 记录日志
        const successCount = Object.values(results).filter(Boolean).length;
        addLogEntry('CONFIG_SAVED', {
            results,
            successCount,
            checksum: checksum?.slice(0, 8)
        });

        if (successCount === 0) {
            Logger.error('所有存储层保存失败！');
            if (window.toastr) {
                toastr.error('配置保存失败，请检查权限', '错误');
            }
        } else {
            Logger.log(`配置已保存到 ${successCount} 个存储层`);
        }

        return results;
    }

    // ==================== 迁移逻辑 ====================

    /**
     * 从旧格式迁移
     */
    async function migrateFromLegacy() {
        try {
            // 尝试读取旧配置文件
            const oldConfig = await readFile(LEGACY_FILES.config);
            if (!oldConfig || !oldConfig.config) {
                return null;
            }

            Logger.log('检测到旧版配置，开始迁移...');
            const config = oldConfig.config;

            // 迁移旧备份索引
            const oldBackupIndex = localStorage.getItem(`${EXTENSION_NAME}_backup_index`);
            if (oldBackupIndex) {
                try {
                    const oldBackups = JSON.parse(oldBackupIndex);
                    const newBackupData = { history: [], lastUpdated: Date.now() };

                    // 尝试读取旧备份文件并合并
                    for (const backup of oldBackups.slice(-MAX_BACKUPS)) {
                        const backupContent = await readFile(backup.filename);
                        if (backupContent && backupContent.config) {
                            newBackupData.history.push({
                                timestamp: backup.timestamp,
                                checksum: backup.checksum,
                                reason: 'migrated',
                                config: backupContent.config
                            });
                        }
                        // 删除旧备份文件
                        await deleteFile(backup.filename);
                    }

                    // 保存新格式备份
                    if (newBackupData.history.length > 0) {
                        await writeFile(STORAGE_FILES.backups, newBackupData);
                        Logger.log(`已迁移 ${newBackupData.history.length} 个备份`);
                    }

                    // 清理旧索引
                    localStorage.removeItem(`${EXTENSION_NAME}_backup_index`);
                } catch (e) {
                    Logger.warn('迁移旧备份失败', e);
                }
            }

            // 删除旧配置文件
            await deleteFile(LEGACY_FILES.config);

            // 初始化新文件
            await writeFile(STORAGE_FILES.cache, {
                prompts: null,
                worldBooks: null,
                lastUpdated: Date.now()
            });

            await writeFile(STORAGE_FILES.log, {
                entries: [{
                    timestamp: Date.now(),
                    action: 'MIGRATED_FROM_V1',
                    details: { oldVersion: oldConfig.version || 1 }
                }],
                lastUpdated: Date.now()
            });

            addLogEntry('MIGRATION_COMPLETED', { fromVersion: oldConfig.version || 1 });
            Logger.log('✓ 迁移完成');

            return config;
        } catch (e) {
            Logger.error('迁移失败', e);
            return null;
        }
    }

    // ==================== 导入/导出 ====================

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
                exportedBy: 'Writer Brianer v2.0',
                config: config,
                // 包含端点配置
                embeddedEndpoints: extractEndpointsFromConfig(config)
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

            addLogEntry('CONFIG_EXPORTED', { filename });
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
     * 从文件导入配置
     */
    async function importConfig(file) {
        try {
            const text = await file.text();
            const importData = JSON.parse(text);

            if (!importData.config) {
                throw new Error('无效的配置文件格式');
            }

            const isValid = await verifyIntegrity(importData.config, importData.checksum);
            if (!isValid) {
                Logger.warn('导入文件校验失败');
                if (window.toastr) {
                    toastr.warning('文件校验失败，数据可能已损坏', '警告');
                }
            }

            const config = importData.config;

            // 合并嵌入的端点
            if (importData.embeddedEndpoints) {
                mergeEndpointsToConfig(config, importData.embeddedEndpoints);
            }

            addLogEntry('CONFIG_IMPORTED', {
                version: importData.version,
                timestamp: importData.timestamp
            });

            Logger.log('配置导入成功');
            if (window.toastr) {
                toastr.success('配置导入成功', '导入成功');
            }

            return config;
        } catch (e) {
            Logger.error('导入配置失败', e);
            if (window.toastr) {
                toastr.error('导入配置失败: ' + e.message, '错误');
            }
            return null;
        }
    }

    /**
     * 从配置中提取端点
     */
    function extractEndpointsFromConfig(config) {
        const result = { selectiveMode: [], memory: [] };
        const globalPools = config?.globalPools;

        if (!globalPools) return result;

        if (globalPools.selectiveMode?.apiEndpoints) {
            result.selectiveMode = globalPools.selectiveMode.apiEndpoints.map(ep => ({ ...ep }));
        }
        if (globalPools.memory?.apiEndpoints) {
            result.memory = globalPools.memory.apiEndpoints.map(ep => ({ ...ep }));
        }

        return result;
    }

    /**
     * 合并端点到配置
     */
    function mergeEndpointsToConfig(config, endpoints) {
        if (!config.globalPools) {
            config.globalPools = {
                selectiveMode: { apiEndpoints: [] },
                memory: { apiEndpoints: [] }
            };
        }

        const pools = config.globalPools;

        if (!pools.selectiveMode) pools.selectiveMode = { apiEndpoints: [] };
        if (!pools.memory) pools.memory = { apiEndpoints: [] };

        // 合并端点（按ID去重）
        for (const ep of (endpoints.selectiveMode || [])) {
            if (!pools.selectiveMode.apiEndpoints.find(e => e.id === ep.id)) {
                pools.selectiveMode.apiEndpoints.push(ep);
            }
        }
        for (const ep of (endpoints.memory || [])) {
            if (!pools.memory.apiEndpoints.find(e => e.id === ep.id)) {
                pools.memory.apiEndpoints.push(ep);
            }
        }
    }

    // ==================== 存储统计 ====================

    /**
     * 获取存储统计信息
     */
    async function getStorageStats() {
        const stats = {
            version: STORAGE_VERSION,
            files: {},
            backups: { count: 0, totalSize: 0 },
            log: { count: 0 },
            indexedDB: { available: false, hasData: false },
            localStorage: { used: 0 }
        };

        // 检查各文件
        for (const [key, filename] of Object.entries(STORAGE_FILES)) {
            const data = await readFile(filename);
            stats.files[key] = {
                exists: !!data,
                size: data ? JSON.stringify(data).length : 0
            };
        }

        // 备份统计（使用索引）
        const backupIndex = await readBackupIndex();
        stats.backups.count = backupIndex.entries?.length || 0;
        stats.backups.totalSize = (backupIndex.entries || []).reduce((sum, e) => sum + (e.size || 0), 0);
        stats.backups.totalSizeFormatted = formatSize(stats.backups.totalSize);

        // 日志统计
        const log = await readLog();
        stats.log.count = log.entries?.length || 0;

        // IndexedDB统计
        try {
            const idbData = await loadFromIndexedDB();
            stats.indexedDB.available = true;
            stats.indexedDB.hasData = !!(idbData && idbData.config);
            if (idbData) {
                stats.indexedDB.size = JSON.stringify(idbData).length;
            }
        } catch (e) {
            stats.indexedDB.available = false;
        }

        // localStorage统计
        try {
            let totalSize = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length + key.length;
                }
            }
            stats.localStorage.used = totalSize;
        } catch (e) { /* ignore */ }

        return stats;
    }

    // ==================== 导出API ====================

    window.WBAP.PersistentStorage = {
        // 主配置
        loadConfig,
        saveConfig,

        // 备份（索引化独立文件存储 v3.0）
        createBackup,
        restoreFromBackup,
        listBackups,
        getBackupById,
        deleteBackup,
        readBackupIndex,

        // 紧急备份
        createEmergencyBackup,
        restoreFromEmergencyBackup,

        // 页面刷新备份
        createRefreshBackupSync,
        restoreFromRefreshBackup,
        initRefreshBackupSystem,

        // 缓存
        readCache,
        updateCache,
        clearCache,

        // 日志
        readLog,
        clearLog,
        flushLog,

        // 元数据
        readMeta,

        // 导入/导出
        exportConfig,
        importConfig,

        // 统计
        getStorageStats,

        // IndexedDB
        saveToIndexedDB,
        loadFromIndexedDB,

        // 工具
        calculateChecksum,
        verifyIntegrity,

        // 常量
        STORAGE_FILES,
        STORAGE_VERSION,
        BACKUP_FILE_PREFIX,
        MAX_BACKUPS
    };

    Logger.log('持久化存储模块已加载 (v3.0 - 八层索引化存储架构)');

})();
