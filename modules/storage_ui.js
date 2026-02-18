// modules/storage_ui.js
// 存储管理UI模块

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    /**
     * 格式化字节大小
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * 创建存储状态面板HTML
     */
    function createStorageStatusHTML(stats) {
        const filesystemStatus = stats.filesystem.available
            ? `<span class="wbap-status-ok">✓ 可用 (${formatBytes(stats.filesystem.size)})</span>`
            : `<span class="wbap-status-error">✗ 不可用</span>`;

        const stStatus = stats.ST.available
            ? `<span class="wbap-status-ok">✓ 可用 (${formatBytes(stats.ST.size)})</span>`
            : `<span class="wbap-status-error">✗ 不可用</span>`;

        const localStorageStatus = stats.localStorage.available
            ? `<span class="wbap-status-ok">✓ 可用 (${formatBytes(stats.localStorage.size)})</span>`
            : `<span class="wbap-status-error">✗ 不可用</span>`;

        const localStorageUsage = stats.localStorage.limit > 0
            ? `${Math.round(stats.localStorage.used / stats.localStorage.limit * 100)}%`
            : '未知';

        return `
            <div class="wbap-storage-status">
                <h4>存储状态</h4>
                <table class="wbap-storage-table">
                    <tr>
                        <td><strong>文件系统存储</strong></td>
                        <td>${filesystemStatus}</td>
                    </tr>
                    <tr>
                        <td><strong>SillyTavern配置</strong></td>
                        <td>${stStatus}</td>
                    </tr>
                    <tr>
                        <td><strong>localStorage缓存</strong></td>
                        <td>${localStorageStatus}</td>
                    </tr>
                    <tr>
                        <td><strong>localStorage使用率</strong></td>
                        <td>${localStorageUsage}</td>
                    </tr>
                    <tr>
                        <td><strong>自动备份数量</strong></td>
                        <td>${stats.backups.count} 个</td>
                    </tr>
                </table>
            </div>
        `;
    }

    /**
     * 创建存储管理面板
     */
    async function createStoragePanel() {
        const panel = document.createElement('div');
        panel.className = 'wbap-storage-panel';
        panel.innerHTML = `
            <div class="wbap-storage-header">
                <h3>数据存储管理</h3>
                <button class="wbap-close-btn" id="wbap-close-storage-panel">×</button>
            </div>
            <div class="wbap-storage-content">
                <div id="wbap-storage-status-container">
                    <p>正在加载存储状态...</p>
                </div>

                <div class="wbap-storage-actions">
                    <h4>数据管理</h4>
                    <div class="wbap-action-buttons">
                        <button id="wbap-export-config" class="wbap-btn wbap-btn-primary">
                            📥 导出配置
                        </button>
                        <button id="wbap-import-config" class="wbap-btn wbap-btn-primary">
                            📤 导入配置
                        </button>
                        <input type="file" id="wbap-import-file-input" accept=".json" style="display: none;">
                    </div>
                    <div class="wbap-action-buttons">
                        <button id="wbap-create-backup" class="wbap-btn wbap-btn-secondary">
                            💾 手动创建备份
                        </button>
                        <button id="wbap-restore-backup" class="wbap-btn wbap-btn-warning">
                            🔄 从备份恢复
                        </button>
                    </div>
                    <div class="wbap-action-buttons">
                        <button id="wbap-refresh-status" class="wbap-btn wbap-btn-secondary">
                            🔄 刷新状态
                        </button>
                    </div>
                </div>

                <div class="wbap-storage-info">
                    <h4>存储说明</h4>
                    <ul>
                        <li><strong>文件系统存储</strong>: 最可靠的存储方式，数据保存在插件目录中</li>
                        <li><strong>SillyTavern配置</strong>: 保存在ST的settings.json中</li>
                        <li><strong>localStorage缓存</strong>: 浏览器本地缓存，用于快速读取</li>
                        <li><strong>自动备份</strong>: 每次保存时自动创建，保留最近10个版本</li>
                    </ul>
                </div>
            </div>
        `;

        // 添加样式
        if (!document.getElementById('wbap-storage-panel-styles')) {
            const style = document.createElement('style');
            style.id = 'wbap-storage-panel-styles';
            style.textContent = `
                .wbap-storage-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 600px;
                    max-width: 90vw;
                    max-height: 80vh;
                    background: var(--SmartThemeBodyColor, #222);
                    border: 2px solid var(--SmartThemeBorderColor, #444);
                    border-radius: 8px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                    z-index: 10000;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .wbap-storage-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background: var(--SmartThemeBlurTintColor, #333);
                    border-bottom: 1px solid var(--SmartThemeBorderColor, #444);
                }

                .wbap-storage-header h3 {
                    margin: 0;
                    font-size: 18px;
                    color: var(--SmartThemeEmColor, #fff);
                }

                .wbap-close-btn {
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: var(--SmartThemeEmColor, #fff);
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .wbap-close-btn:hover {
                    color: #f44336;
                }

                .wbap-storage-content {
                    padding: 20px;
                    overflow-y: auto;
                    flex: 1;
                }

                .wbap-storage-status {
                    margin-bottom: 20px;
                    padding: 15px;
                    background: var(--SmartThemeBlurTintColor, #2a2a2a);
                    border-radius: 6px;
                }

                .wbap-storage-status h4 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    color: var(--SmartThemeEmColor, #fff);
                }

                .wbap-storage-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .wbap-storage-table td {
                    padding: 8px 0;
                    color: var(--SmartThemeBodyColor, #ccc);
                }

                .wbap-storage-table td:first-child {
                    width: 50%;
                }

                .wbap-status-ok {
                    color: #4caf50;
                }

                .wbap-status-error {
                    color: #f44336;
                }

                .wbap-storage-actions {
                    margin-bottom: 20px;
                }

                .wbap-storage-actions h4 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    color: var(--SmartThemeEmColor, #fff);
                }

                .wbap-action-buttons {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .wbap-btn {
                    flex: 1;
                    padding: 10px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }

                .wbap-btn-primary {
                    background: #2196f3;
                    color: white;
                }

                .wbap-btn-primary:hover {
                    background: #1976d2;
                }

                .wbap-btn-secondary {
                    background: #757575;
                    color: white;
                }

                .wbap-btn-secondary:hover {
                    background: #616161;
                }

                .wbap-btn-warning {
                    background: #ff9800;
                    color: white;
                }

                .wbap-btn-warning:hover {
                    background: #f57c00;
                }

                .wbap-storage-info {
                    padding: 15px;
                    background: var(--SmartThemeBlurTintColor, #2a2a2a);
                    border-radius: 6px;
                }

                .wbap-storage-info h4 {
                    margin-top: 0;
                    margin-bottom: 10px;
                    color: var(--SmartThemeEmColor, #fff);
                }

                .wbap-storage-info ul {
                    margin: 0;
                    padding-left: 20px;
                    color: var(--SmartThemeBodyColor, #ccc);
                }

                .wbap-storage-info li {
                    margin-bottom: 8px;
                    line-height: 1.5;
                }
            `;
            document.head.appendChild(style);
        }

        // 加载存储状态
        if (WBAP.PersistentStorage) {
            const stats = await WBAP.PersistentStorage.getStorageStats();
            const statusContainer = panel.querySelector('#wbap-storage-status-container');
            statusContainer.innerHTML = createStorageStatusHTML(stats);
        }

        // 绑定事件
        panel.querySelector('#wbap-close-storage-panel').addEventListener('click', () => {
            panel.remove();
        });

        panel.querySelector('#wbap-export-config').addEventListener('click', async () => {
            if (WBAP.PersistentStorage && WBAP.mainConfig) {
                await WBAP.PersistentStorage.exportConfig(WBAP.mainConfig);
            } else {
                if (window.toastr) {
                    toastr.error('持久化存储模块未加载', '错误');
                }
            }
        });

        panel.querySelector('#wbap-import-config').addEventListener('click', () => {
            panel.querySelector('#wbap-import-file-input').click();
        });

        panel.querySelector('#wbap-import-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (WBAP.PersistentStorage) {
                const config = await WBAP.PersistentStorage.importConfig(file);
                if (config) {
                    // 确认导入
                    if (confirm('确定要导入此配置吗？当前配置将被覆盖。')) {
                        WBAP.mainConfig = config;
                        await WBAP.saveConfig();
                        if (window.toastr) {
                            toastr.success('配置已导入并保存，请刷新页面', '导入成功');
                        }
                        // 刷新状态
                        const stats = await WBAP.PersistentStorage.getStorageStats();
                        const statusContainer = panel.querySelector('#wbap-storage-status-container');
                        statusContainer.innerHTML = createStorageStatusHTML(stats);
                    }
                }
            }
            // 清空文件输入
            e.target.value = '';
        });

        panel.querySelector('#wbap-create-backup').addEventListener('click', async () => {
            if (WBAP.PersistentStorage && WBAP.mainConfig) {
                const success = await WBAP.PersistentStorage.createBackup(WBAP.mainConfig);
                if (success) {
                    if (window.toastr) {
                        toastr.success('备份已创建', '成功');
                    }
                    // 刷新状态
                    const stats = await WBAP.PersistentStorage.getStorageStats();
                    const statusContainer = panel.querySelector('#wbap-storage-status-container');
                    statusContainer.innerHTML = createStorageStatusHTML(stats);
                }
            }
        });

        panel.querySelector('#wbap-restore-backup').addEventListener('click', async () => {
            if (!confirm('确定要从最新备份恢复配置吗？当前未保存的更改将丢失。')) {
                return;
            }

            if (WBAP.PersistentStorage) {
                const config = await WBAP.PersistentStorage.restoreFromBackup();
                if (config) {
                    WBAP.mainConfig = config;
                    await WBAP.saveConfig();
                    if (window.toastr) {
                        toastr.success('配置已从备份恢复，请刷新页面', '恢复成功');
                    }
                } else {
                    if (window.toastr) {
                        toastr.error('没有可用的备份', '恢复失败');
                    }
                }
            }
        });

        panel.querySelector('#wbap-refresh-status').addEventListener('click', async () => {
            if (WBAP.PersistentStorage) {
                const statusContainer = panel.querySelector('#wbap-storage-status-container');
                statusContainer.innerHTML = '<p>正在刷新...</p>';
                const stats = await WBAP.PersistentStorage.getStorageStats();
                statusContainer.innerHTML = createStorageStatusHTML(stats);
                if (window.toastr) {
                    toastr.success('状态已刷新', '成功');
                }
            }
        });

        return panel;
    }

    /**
     * 显示存储管理面板
     */
    async function showStoragePanel() {
        // 移除已存在的面板
        const existing = document.querySelector('.wbap-storage-panel');
        if (existing) {
            existing.remove();
        }

        const panel = await createStoragePanel();
        document.body.appendChild(panel);
    }

    // 导出API
    window.WBAP.StorageUI = {
        showStoragePanel,
        createStoragePanel
    };

    Logger.log('存储管理UI模块已加载');

})();
