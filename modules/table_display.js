// modules/table_display.js
// 表格展示模块 - 从 AI 回复中提取表格数据并展示

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[TableDisplay]';

    // ==================== 模块状态 ====================

    const state = {
        initialized: false,
        elements: {},
        currentEditingTable: null
    };

    // ==================== 配置获取 ====================

    /**
     * 获取全局表格展示配置
     * 存储位置: mainConfig.globalPools.tableDisplay
     * @returns {Object} 全局配置对象
     */
    function getGlobalTableDisplayConfig() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        
        if (!pools.tableDisplay) {
            pools.tableDisplay = createDefaultGlobalTableDisplayConfig();
        }
        
        return pools.tableDisplay;
    }

    /**
     * 获取当前角色的表格展示配置
     * 存储位置: characterConfig.tableDisplay
     * @returns {Object} 角色配置对象
     */
    function getCharacterTableDisplayConfig() {
        const charConfig = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        
        if (!charConfig.tableDisplay) {
            charConfig.tableDisplay = createDefaultCharacterTableDisplayConfig();
        }
        
        return charConfig.tableDisplay;
    }

    /**
     * 确保表格展示配置结构完整
     * 同时确保全局配置和角色配置都存在且结构完整
     */
    function ensureTableDisplayConfig() {
        // 确保全局配置存在
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.tableDisplay) {
            pools.tableDisplay = createDefaultGlobalTableDisplayConfig();
        } else {
            // 确保全局配置结构完整
            const defaultGlobal = createDefaultGlobalTableDisplayConfig();
            if (!Array.isArray(pools.tableDisplay.templates)) {
                pools.tableDisplay.templates = defaultGlobal.templates;
            }
            if (!Array.isArray(pools.tableDisplay.tables)) {
                pools.tableDisplay.tables = defaultGlobal.tables;
            }
            if (!pools.tableDisplay.apiConfig) {
                pools.tableDisplay.apiConfig = defaultGlobal.apiConfig;
            }
            if (!pools.tableDisplay.promptTemplates) {
                pools.tableDisplay.promptTemplates = defaultGlobal.promptTemplates;
            }
        }

        // 确保角色配置存在
        const charConfig = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        if (!charConfig.tableDisplay) {
            charConfig.tableDisplay = createDefaultCharacterTableDisplayConfig();
        } else {
            // 确保角色配置结构完整
            const defaultChar = createDefaultCharacterTableDisplayConfig();
            if (charConfig.tableDisplay.enabled === undefined) {
                charConfig.tableDisplay.enabled = defaultChar.enabled;
            }
            if (!charConfig.tableDisplay.extractTag) {
                charConfig.tableDisplay.extractTag = defaultChar.extractTag;
            }
            if (!charConfig.tableDisplay.editTag) {
                charConfig.tableDisplay.editTag = defaultChar.editTag;
            }
            if (charConfig.tableDisplay.renderInMessage === undefined) {
                charConfig.tableDisplay.renderInMessage = defaultChar.renderInMessage;
            }
        }

        return {
            global: pools.tableDisplay,
            character: charConfig.tableDisplay
        };
    }

    /**
     * 加载默认表格预设（提示词规则 + 默认表格模板）
     * 仅在首次使用（无模板且无表格时）自动加载
     * @returns {Promise<boolean>} 是否成功加载
     */
    async function loadDefaultPresets() {
        const globalConfig = getGlobalTableDisplayConfig();
        
        const hasTemplates = globalConfig.templates && globalConfig.templates.length > 0;
        const hasTables = globalConfig.tables && globalConfig.tables.length > 0;
        
        // 检查提示词是否还是出厂默认值（未被真正规则替换过）
        const defaultPrompt = '请根据以下聊天记录，批量填写所有表格。';
        const currentBatch = globalConfig.promptTemplates?.batch || '';
        const needsPromptUpdate = !globalConfig.promptPresets && 
            (!currentBatch || currentBatch.startsWith(defaultPrompt));

        // 如果模板/表格/提示词都已就绪，跳过
        if ((hasTemplates || hasTables) && !needsPromptUpdate) {
            return false;
        }

        try {
            // 尝试加载默认预设文件
            const basePath = WBAP.extensionFolderPath || '/scripts/extensions/third-party/writer brianer';
            const response = await fetch(`${basePath}/prompts/default_table_presets.json`);
            if (!response.ok) {
                Logger.warn(TAG, '默认预设文件不存在或无法加载');
                return false;
            }
            
            const presets = await response.json();
            let loaded = false;
            
            // 加载提示词规则（独立判断，即使已有表格也可更新提示词）
            if (presets.promptTemplates && needsPromptUpdate) {
                if (!globalConfig.promptTemplates) {
                    globalConfig.promptTemplates = {};
                }
                // 将完整的预设结构存入
                globalConfig.promptPresets = presets.promptTemplates;
                
                // 同时更新简单的 promptTemplates（用于编辑器显示）
                for (const [key, preset] of Object.entries(presets.promptTemplates)) {
                    if (preset.prompts && preset.prompts.length > 0) {
                        // 取第一条 system prompt 作为编辑器显示内容
                        globalConfig.promptTemplates[key] = preset.prompts[0].content;
                    }
                }
                Logger.log(TAG, '默认提示词规则已加载');
                loaded = true;
            }
            
            // 加载默认表格模板（仅在无模板无表格时）
            if (!hasTemplates && !hasTables && presets.defaultTables && Array.isArray(presets.defaultTables)) {
                for (const tableDef of presets.defaultTables) {
                    const templateJson = JSON.stringify({
                        name: tableDef.name,
                        columns: tableDef.columns,
                        description: tableDef.description || '',
                        config: tableDef.config || {}
                    });
                    importTemplate(templateJson);
                }
                Logger.log(TAG, `已加载 ${presets.defaultTables.length} 个默认表格模板`);
                loaded = true;
            }
            
            return loaded;
        } catch (e) {
            Logger.error(TAG, '加载默认预设失败', e);
            return false;
        }
    }

    /**
     * 保存配置
     * @returns {Promise<void>}
     */
    async function saveConfig() {
        try {
            if (typeof WBAP.saveConfig === 'function') {
                await WBAP.saveConfig();
                Logger.log(TAG, '配置已保存');
            }
        } catch (e) {
            Logger.error(TAG, '保存配置失败', e);
            throw e;
        }
    }

    // ==================== 模板管理器 ====================

    /**
     * 生成唯一的模板 UID
     * @returns {string} 唯一标识符
     */
    function generateTemplateUid() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `tpl_${timestamp}_${random}`;
    }

    /**
     * 验证模板格式是否符合 st-memory-enhancement 规范
     * @param {Object} template - 待验证的模板对象
     * @returns {{valid: boolean, error?: string}} 验证结果
     */
    function validateTemplate(template) {
        // 检查是否为对象
        if (!template || typeof template !== 'object') {
            return { valid: false, error: 'JSON 格式无效：模板必须是对象' };
        }

        // 检查必要字段 - name
        if (!template.name || typeof template.name !== 'string' || template.name.trim() === '') {
            return { valid: false, error: '模板格式不完整：缺少有效的 name 字段' };
        }

        // 检查必要字段 - columns
        if (!template.columns) {
            return { valid: false, error: '模板格式不完整：缺少 columns 字段' };
        }

        if (!Array.isArray(template.columns)) {
            return { valid: false, error: '列定义格式错误：columns 必须是数组' };
        }

        if (template.columns.length === 0) {
            return { valid: false, error: '列定义格式错误：columns 不能为空数组' };
        }

        // 验证每个列名都是字符串
        for (let i = 0; i < template.columns.length; i++) {
            if (typeof template.columns[i] !== 'string') {
                return { valid: false, error: `列定义格式错误：第 ${i + 1} 列名必须是字符串` };
            }
        }

        // 可选字段验证
        if (template.description !== undefined && typeof template.description !== 'string') {
            return { valid: false, error: '模板格式错误：description 必须是字符串' };
        }

        if (template.config !== undefined && typeof template.config !== 'object') {
            return { valid: false, error: '模板格式错误：config 必须是对象' };
        }

        return { valid: true };
    }

    /**
     * 检测是否为 Amily2 预设格式
     * @param {Object} parsed - 解析后的 JSON 对象
     * @returns {boolean} 是否为 Amily2 格式
     */
    function isAmily2PresetFormat(parsed) {
        return parsed
            && typeof parsed === 'object'
            && Array.isArray(parsed.tables)
            && parsed.tables.length > 0
            && parsed.tables.every(t => t && typeof t.name === 'string' && Array.isArray(t.headers));
    }

    /**
     * 将 Amily2 单个表格转换为标准模板对象
     * @param {Object} amily2Table - Amily2 格式的表格对象
     * @returns {Object} 标准模板对象
     */
    function convertAmily2TableToTemplate(amily2Table) {
        return {
            uid: generateTemplateUid(),
            name: amily2Table.name.trim(),
            columns: [...amily2Table.headers],
            description: amily2Table.note || '',
            config: {
                note: amily2Table.note || '',
                insertNode: amily2Table.rule_add || '',
                updateNode: amily2Table.rule_update || '',
                deleteNode: amily2Table.rule_delete || ''
            },
            createdAt: Date.now()
        };
    }

    /**
     * 批量导入 Amily2 预设中的所有表格模板
     * @param {Object} preset - Amily2 预设对象
     * @returns {Object[]} 导入成功的模板数组
     */
    function importAmily2Preset(preset) {
        const globalConfig = getGlobalTableDisplayConfig();
        const imported = [];

        // 收集预设中的表格名称，用于清理旧数据
        const incomingNames = new Set(preset.tables.map(t => t.name?.trim()).filter(Boolean));

        // 清除同名旧模板及其关联的表格实例
        const oldTemplateUids = new Set();
        globalConfig.templates = globalConfig.templates.filter(tpl => {
            if (incomingNames.has(tpl.name)) {
                oldTemplateUids.add(tpl.uid);
                Logger.log(TAG, `清除旧模板: ${tpl.name} (${tpl.uid})`);
                return false;
            }
            return true;
        });
        // 清除关联的旧表格实例
        if (oldTemplateUids.size > 0) {
            globalConfig.tables = globalConfig.tables.filter(tbl => {
                if (oldTemplateUids.has(tbl.templateUid)) {
                    Logger.log(TAG, `清除旧表格: ${tbl.name} (${tbl.uid})`);
                    return false;
                }
                return true;
            });
        }

        for (const table of preset.tables) {
            if (!table.name || !Array.isArray(table.headers) || table.headers.length === 0) {
                Logger.warn(TAG, `跳过无效表格: ${table.name || '(unnamed)'}`);
                continue;
            }
            const template = convertAmily2TableToTemplate(table);
            globalConfig.templates.push(template);
            imported.push(template);
            Logger.log(TAG, `Amily2 模板导入: ${template.name} (${template.uid})`);
        }

        if (imported.length > 0) {
            // 存储 batchFiller 模板到全局配置（如果存在）
            if (preset.batchFillerRuleTemplate || preset.batchFillerFlowTemplate) {
                globalConfig.amily2Meta = {
                    version: preset.version || '',
                    batchFillerRuleTemplate: preset.batchFillerRuleTemplate || '',
                    batchFillerFlowTemplate: preset.batchFillerFlowTemplate || ''
                };
            }

            // 自动为每个模板创建对应的表格实例
            for (const tpl of imported) {
                const tableObj = {
                    uid: generateTableUid(),
                    templateUid: tpl.uid,
                    name: tpl.name,
                    rows: [],
                    enabled: true,
                    updatedAt: Date.now()
                };
                globalConfig.tables.push(tableObj);
                Logger.log(TAG, `自动创建表格: ${tableObj.name} (${tableObj.uid})`);
            }

            // 注意：不在此处保存，由调用者负责保存以避免竞态
        }

        Logger.log(TAG, `Amily2 预设导入完成: ${imported.length}/${preset.tables.length} 个模板+表格`);
        return imported;
    }

    /**
     * 导入模板（从 JSON 字符串）
     * 自动检测格式：支持单模板格式和 Amily2 预设批量格式
     * @param {string} jsonString - JSON 格式的模板字符串
     * @returns {Object|Object[]|null} 单模板返回对象，Amily2 批量返回数组，失败返回 null
     */
    function importTemplate(jsonString) {
        let parsed;
        
        // 解析 JSON
        try {
            parsed = JSON.parse(jsonString);
        } catch (e) {
            Logger.error(TAG, 'JSON 解析失败', e);
            return null;
        }

        // 自动检测 Amily2 预设格式
        if (isAmily2PresetFormat(parsed)) {
            const results = importAmily2Preset(parsed);
            return results.length > 0 ? results : null;
        }

        // 标准单模板格式验证
        const validation = validateTemplate(parsed);
        if (!validation.valid) {
            Logger.error(TAG, validation.error);
            return null;
        }

        // 创建标准化的模板对象
        const template = {
            uid: generateTemplateUid(),
            name: parsed.name.trim(),
            columns: [...parsed.columns],
            description: parsed.description || '',
            config: {
                note: parsed.config?.note || '',
                insertNode: parsed.config?.insertNode || '',
                updateNode: parsed.config?.updateNode || '',
                deleteNode: parsed.config?.deleteNode || ''
            },
            createdAt: Date.now()
        };

        // 保存到全局配置
        const globalConfig = getGlobalTableDisplayConfig();
        globalConfig.templates.push(template);
        
        // 注意：不在此处保存，由调用者负责保存以避免竞态

        Logger.log(TAG, `模板导入成功: ${template.name} (${template.uid})`);
        return template;
    }

    /**
     * 导出模板（转为 JSON 字符串）
     * @param {string} templateUid - 模板 UID
     * @returns {string|null} JSON 字符串，失败返回 null
     */
    function exportTemplate(templateUid) {
        const template = getTemplateByUid(templateUid);
        if (!template) {
            Logger.error(TAG, `导出失败：找不到模板 ${templateUid}`);
            return null;
        }

        // 导出时移除 uid 和 createdAt，保持与导入格式一致
        const exportData = {
            name: template.name,
            columns: [...template.columns],
            description: template.description,
            config: { ...template.config }
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 删除模板
     * @param {string} templateUid - 模板 UID
     * @returns {boolean} 是否删除成功
     */
    function deleteTemplate(templateUid) {
        const globalConfig = getGlobalTableDisplayConfig();
        const index = globalConfig.templates.findIndex(t => t.uid === templateUid);
        
        if (index === -1) {
            Logger.error(TAG, `删除失败：找不到模板 ${templateUid}`);
            return false;
        }

        const deleted = globalConfig.templates.splice(index, 1)[0];
        
        saveConfig().catch(e => {
            Logger.error(TAG, '保存配置失败', e);
        });

        Logger.log(TAG, `模板已删除: ${deleted.name} (${templateUid})`);
        return true;
    }

    /**
     * 按 UID 获取模板
     * @param {string} uid - 模板 UID
     * @returns {Object|null} 模板对象，找不到返回 null
     */
    function getTemplateByUid(uid) {
        const templates = getTemplates();
        return templates.find(t => t.uid === uid) || null;
    }

    // ==================== 默认配置工厂 ====================

    /**
     * 创建默认的全局表格展示配置
     * @returns {Object} 默认全局配置
     */
    function createDefaultGlobalTableDisplayConfig() {
            return {
                templates: [],
                tables: [],
                promptTemplates: {
                    batch: '请根据以下聊天记录，批量填写所有表格。\n\n聊天记录：\n{chat_history}\n\n当前表格：\n{current_table}\n\n请按照表格格式输出更新后的内容。',
                    single: '请根据以下聊天记录，更新指定表格的内容。\n\n聊天记录：\n{chat_history}\n\n当前表格：\n{current_table}\n\n用户名：{user_name}\n角色名：{char_name}',
                    reorg: '请重新整理以下表格数据，去除冗余和过时的信息。\n\n当前表格：\n{current_table}\n\n用户名：{user_name}\n角色名：{char_name}'
                },
                apiConfig: {
                    apiUrl: '',
                    apiKey: '',
                    model: '',
                    maxTokens: 2000,
                    temperature: 0.7,
                    timeout: 60
                }
            };
        }


    /**
     * 创建默认的角色表格展示配置
     * @returns {Object} 默认角色配置
     */
    function createDefaultCharacterTableDisplayConfig() {
        return {
            enabled: false,
            extractTag: 'content',
            editTag: 'Amily2Edit',
            renderInMessage: true
        };
    }

    // ==================== 表格管理器 ====================

    /**
     * 生成唯一的表格 UID
     * @returns {string} 唯一标识符
     */
    function generateTableUid() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `tbl_${timestamp}_${random}`;
    }

    /**
     * 生成唯一的行 UID
     * @returns {string} 唯一标识符
     */
    function generateRowUid() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `row_${timestamp}_${random}`;
    }

    /**
     * 创建表格
     * @param {string} templateUid - 关联的模板 UID
     * @returns {Object|null} 创建的表格对象，失败返回 null
     */
    function createTable(templateUid) {
        const template = getTemplateByUid(templateUid);
        if (!template) {
            Logger.error(TAG, `创建表格失败：找不到模板 ${templateUid}`);
            return null;
        }

        const table = {
            uid: generateTableUid(),
            templateUid: templateUid,
            name: template.name,
            rows: [],
            enabled: true,
            updatedAt: Date.now()
        };

        const globalConfig = getGlobalTableDisplayConfig();
        globalConfig.tables.push(table);

        saveConfig().catch(e => {
            Logger.error(TAG, '保存表格失败', e);
        });

        Logger.log(TAG, `表格创建成功: ${table.name} (${table.uid})`);
        return table;
    }

    /**
     * 删除表格
     * @param {string} tableUid - 表格 UID
     * @returns {boolean} 是否删除成功
     */
    function deleteTable(tableUid) {
        const globalConfig = getGlobalTableDisplayConfig();
        const index = globalConfig.tables.findIndex(t => t.uid === tableUid);

        if (index === -1) {
            Logger.error(TAG, `删除失败：找不到表格 ${tableUid}`);
            return false;
        }

        const deleted = globalConfig.tables.splice(index, 1)[0];

        saveConfig().catch(e => {
            Logger.error(TAG, '保存配置失败', e);
        });

        Logger.log(TAG, `表格已删除: ${deleted.name} (${tableUid})`);
        return true;
    }

    /**
     * 获取表格
     * @param {string} tableUid - 表格 UID
     * @returns {Object|null} 表格对象，找不到返回 null
     */
    function getTable(tableUid) {
        const tables = getTables();
        return tables.find(t => t.uid === tableUid) || null;
    }

    /**
     * 插入行
     * @param {string} tableUid - 表格 UID
     * @param {Object} rowData - 行数据，格式为 {colIndex: value, ...}
     * @returns {Object|null} 创建的行对象，失败返回 null
     */
    function insertRow(tableUid, rowData) {
        const table = getTable(tableUid);
        if (!table) {
            Logger.error(TAG, `插入行失败：找不到表格 ${tableUid}`);
            return null;
        }

        const template = getTemplateByUid(table.templateUid);
        if (!template) {
            Logger.error(TAG, `插入行失败：找不到模板 ${table.templateUid}`);
            return null;
        }

        // 创建单元格数组，根据模板列数初始化
        const cells = new Array(template.columns.length).fill('');

        // 填充提供的数据
        if (rowData && typeof rowData === 'object') {
            for (const [colIndex, value] of Object.entries(rowData)) {
                const idx = parseInt(colIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < cells.length) {
                    cells[idx] = handleCellValue(value);
                }
            }
        }

        const row = {
            uid: generateRowUid(),
            cells: cells,
            createdAt: Date.now()
        };

        table.rows.push(row);
        table.updatedAt = Date.now();

        saveConfig().catch(e => {
            Logger.error(TAG, '保存行失败', e);
        });

        Logger.log(TAG, `行插入成功: 表格 ${table.name}, 行 ${row.uid}`);
        return row;
    }

    /**
     * 更新行
     * @param {string} tableUid - 表格 UID
     * @param {number} rowIndex - 行索引
     * @param {Object} rowData - 行数据，格式为 {colIndex: value, ...}
     * @returns {boolean} 是否更新成功
     */
    function updateRow(tableUid, rowIndex, rowData) {
        const table = getTable(tableUid);
        if (!table) {
            Logger.error(TAG, `更新行失败：找不到表格 ${tableUid}`);
            return false;
        }

        if (rowIndex < 0 || rowIndex >= table.rows.length) {
            Logger.error(TAG, `更新行失败：行索引 ${rowIndex} 超出范围`);
            return false;
        }

        const row = table.rows[rowIndex];

        // 更新提供的单元格数据
        if (rowData && typeof rowData === 'object') {
            for (const [colIndex, value] of Object.entries(rowData)) {
                const idx = parseInt(colIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < row.cells.length) {
                    row.cells[idx] = handleCellValue(value);
                }
            }
        }

        table.updatedAt = Date.now();

        saveConfig().catch(e => {
            Logger.error(TAG, '保存更新失败', e);
        });

        Logger.log(TAG, `行更新成功: 表格 ${table.name}, 行索引 ${rowIndex}`);
        return true;
    }

    /**
     * 删除行
     * @param {string} tableUid - 表格 UID
     * @param {number} rowIndex - 行索引
     * @returns {boolean} 是否删除成功
     */
    function deleteRow(tableUid, rowIndex) {
        const table = getTable(tableUid);
        if (!table) {
            Logger.error(TAG, `删除行失败：找不到表格 ${tableUid}`);
            return false;
        }

        if (rowIndex < 0 || rowIndex >= table.rows.length) {
            Logger.error(TAG, `删除行失败：行索引 ${rowIndex} 超出范围`);
            return false;
        }

        table.rows.splice(rowIndex, 1);
        table.updatedAt = Date.now();

        saveConfig().catch(e => {
            Logger.error(TAG, '保存删除失败', e);
        });

        Logger.log(TAG, `行删除成功: 表格 ${table.name}, 行索引 ${rowIndex}`);
        return true;
    }

    /**
     * 更新单元格
     * @param {string} tableUid - 表格 UID
     * @param {number} rowIndex - 行索引
     * @param {number} colIndex - 列索引
     * @param {string} value - 单元格值
     * @returns {boolean} 是否更新成功
     */
    function updateCell(tableUid, rowIndex, colIndex, value) {
        const table = getTable(tableUid);
        if (!table) {
            Logger.error(TAG, `更新单元格失败：找不到表格 ${tableUid}`);
            return false;
        }

        if (rowIndex < 0 || rowIndex >= table.rows.length) {
            Logger.error(TAG, `更新单元格失败：行索引 ${rowIndex} 超出范围`);
            return false;
        }

        const row = table.rows[rowIndex];
        if (colIndex < 0 || colIndex >= row.cells.length) {
            Logger.error(TAG, `更新单元格失败：列索引 ${colIndex} 超出范围`);
            return false;
        }

        row.cells[colIndex] = String(value);
        table.updatedAt = Date.now();

        saveConfig().catch(e => {
            Logger.error(TAG, '保存单元格更新失败', e);
        });

        Logger.log(TAG, `单元格更新成功: 表格 ${table.name}, 行 ${rowIndex}, 列 ${colIndex}`);
        return true;
    }


    // ==================== 编辑指令解析器 ====================

    /**
     * 从消息中提取 tableEdit 标签内容
     * @param {string} message - 完整消息文本
     * @param {string} [tagName='tableEdit'] - 标签名
     * @returns {{content: string, editString: string}} 分离后的正文和编辑指令
     */
    function extractTableEditTag(message, tagName) {
        tagName = tagName || 'tableEdit';
        const result = { content: message || '', editString: '' };

        if (!message || typeof message !== 'string') {
            return result;
        }

        const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'g');
        const editParts = [];
        let cleaned = message;

        let match;
        while ((match = regex.exec(message)) !== null) {
            editParts.push(match[1]);
            cleaned = cleaned.replace(match[0], '');
        }

        result.content = cleaned.trim();
        result.editString = editParts.join('\n');
        return result;
    }

    /**
     * 从消息中提取正文标签内容（如 <content>...</content>）
     * @param {string} message - 完整消息文本
     * @param {string} [tagName='content'] - 标签名
     * @returns {{content: string, rest: string}} 正文内容和剩余部分
     */
    function extractContentTag(message, tagName) {
        tagName = tagName || 'content';
        const result = { content: '', rest: message || '' };

        if (!message || typeof message !== 'string') {
            return result;
        }

        const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
        const match = message.match(regex);

        if (match) {
            result.content = match[1].trim();
            result.rest = message.replace(match[0], '').trim();
        } else {
            // 没有标签时，整个消息作为正文
            result.content = message;
            result.rest = '';
        }

        return result;
    }

    /**
     * 处理单元格值：将逗号替换为/符号（与 st-memory-enhancement 一致）
     * @param {string|number} cell - 单元格值
     * @returns {string} 处理后的值
     */
    function handleCellValue(cell) {
        if (typeof cell === 'string') {
            return cell.replace(/,/g, '/');
        } else if (typeof cell === 'number') {
            return String(cell);
        }
        return '';
    }

    /**
     * 宽松解析 JSON 对象字符串（兼容 AI 输出的非标准格式）
     * 支持：无引号 key、单引号、转义单引号、多余逗号等
     * 移植自 st-memory-enhancement/utils/stringUtil.js parseLooseDict
     * @param {string} str - 类 JSON 对象字符串，如 {0:"value",1:'value2'}
     * @returns {Object|null} 解析后的对象
     */
    function parseLooseDict(str) {
        if (!str || typeof str !== 'string') return null;
        try {
            const result = {};
            const content = str.replace(/\s+/g, '').replace(/\\"/g, '"').slice(1, -1);
            let i = 0;
            const len = content.length;

            while (i < len) {
                // 读取 key
                let key = '';
                while (i < len && content[i] !== ':') {
                    key += content[i++];
                }
                key = key.trim().replace(/^["']|["']$/g, '');
                i++; // 跳过冒号

                if (i >= len) break;

                // 读取 value
                let value = '';
                let quoteChar = null;
                let inString = false;

                if (content[i] === '"' || content[i] === "'") {
                    quoteChar = content[i];
                    inString = true;
                    i++;
                }

                while (i < len) {
                    const char = content[i];
                    if (inString) {
                        if (char === quoteChar) {
                            if (content[i + 1] === ',' || content[i + 1] == null) {
                                i++;
                                break;
                            } else {
                                value += char === '"' ? "'" : '"';
                                i++;
                                continue;
                            }
                        }
                        value += char;
                    } else {
                        if (char === ',') break;
                        value += char;
                    }
                    i++;
                }

                result[key] = value.trim().replace(/,/g, '/');

                while (i < len && (content[i] === ',' || content[i] === ' ')) {
                    i++;
                }
            }

            // 只保留数字 key（表格列索引）
            const cleaned = {};
            for (const k of Object.keys(result)) {
                if (/^\d+$/.test(k)) {
                    cleaned[k] = result[k];
                }
            }
            return Object.keys(cleaned).length > 0 ? cleaned : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 格式化参数字符串为对象
     * 先尝试标准 JSON.parse，失败后回退到宽松解析
     * @param {string} paramStr - 参数字符串，如 {"0":"value","1":"value2"}
     * @returns {Object|null} 解析后的参数对象
     */
    function formatParams(paramStr) {
        if (!paramStr || typeof paramStr !== 'string') {
            return null;
        }

        // 先尝试标准 JSON 解析
        try {
            const parsed = JSON.parse(paramStr);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {
            // 标准解析失败，回退到宽松解析
        }

        // 宽松解析（兼容 AI 输出的非标准格式）
        return parseLooseDict(paramStr);
    }

    /**
     * 分类参数：将指令参数字符串拆分为各个部分
     * @param {string} argsStr - 括号内的参数字符串
     * @returns {Array<string>} 参数数组
     */
    function classifyParams(argsStr) {
        if (!argsStr || typeof argsStr !== 'string') {
            return [];
        }

        const params = [];
        let depth = 0;
        let current = '';

        for (let i = 0; i < argsStr.length; i++) {
            const ch = argsStr[i];
            if (ch === '{') {
                depth++;
                current += ch;
            } else if (ch === '}') {
                depth--;
                current += ch;
            } else if (ch === ',' && depth === 0) {
                params.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }

        if (current.trim()) {
            params.push(current.trim());
        }

        return params;
    }

    /**
     * 解析编辑指令字符串
     * 移植自 st-memory-enhancement handleTableEditTag + classifyParams + formatParams 链路
     * 使用位置扫描法而非单一正则，更健壮地处理嵌套括号和非标准格式
     * @param {string} editString - 编辑指令字符串
     * @returns {Array<Object>} 指令对象数组
     */
    function parseEditInstructions(editString) {
        if (!editString || typeof editString !== 'string') {
            return [];
        }

        // 移除 HTML 注释标记
        const cleaned = editString.replace(/<!--/g, '').replace(/-->/g, '');

        // 第一步：定位所有函数调用的起始位置（与 st-memory-enhancement 一致）
        const functionRegex = /(updateRow|insertRow|deleteRow)\(/g;
        const positions = [];
        let match;
        while ((match = functionRegex.exec(cleaned)) !== null) {
            positions.push({
                index: match.index,
                name: match[1].replace('Row', '') // update/insert/delete
            });
        }

        if (positions.length === 0) return [];

        // 第二步：按位置切割出每个函数调用的参数部分
        const instructions = [];
        for (let i = 0; i < positions.length; i++) {
            const start = positions[i].index;
            const end = i + 1 < positions.length ? positions[i + 1].index : cleaned.length;
            const fullCall = cleaned.slice(start, end);
            const lastParenIndex = fullCall.lastIndexOf(')');

            if (lastParenIndex === -1) continue;

            const sliced = fullCall.slice(0, lastParenIndex);
            const argsPart = sliced.slice(sliced.indexOf('(') + 1);

            // 提取参数片段
            const rawArgs = argsPart.match(/("[^"]*"|\{.*\}|[0-9]+)/g)?.map(s => s.trim());
            if (!rawArgs) continue;

            // 格式化参数：数字→Number，{...}→对象，其他→字符串
            const formattedParams = rawArgs.map(item => {
                const trimmed = item.trim();
                if (!isNaN(trimmed) && trimmed !== '') {
                    return Number(trimmed);
                }
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    return formatParams(trimmed);
                }
                return trimmed;
            });

            // 分类参数（与 st-memory-enhancement classifyParams 一致）
            const action = {};
            for (let j = 0; j < formattedParams.length; j++) {
                const p = formattedParams[j];
                if (typeof p === 'number') {
                    if (j === 0) action.tableIndex = p;
                    else if (j === 1) action.rowIndex = p;
                } else if (typeof p === 'object' && p !== null) {
                    action.data = p;
                }
            }

            const type = positions[i].name;

            try {
                if (type === 'insert' && action.tableIndex !== undefined && action.data) {
                    instructions.push({ type: 'insert', tableIndex: action.tableIndex, data: action.data });
                } else if (type === 'update' && action.tableIndex !== undefined && action.rowIndex !== undefined && action.data) {
                    instructions.push({ type: 'update', tableIndex: action.tableIndex, rowIndex: action.rowIndex, data: action.data });
                } else if (type === 'delete' && action.tableIndex !== undefined && action.rowIndex !== undefined) {
                    instructions.push({ type: 'delete', tableIndex: action.tableIndex, rowIndex: action.rowIndex });
                } else {
                    Logger.warn(TAG, `无效的编辑指令: ${type}(${argsPart})`);
                }
            } catch (e) {
                Logger.warn(TAG, `解析指令失败: ${type}(${argsPart})`, e);
            }
        }

        return instructions;
    }

    /**
     * 执行插入指令（含重复行检测）
     * @param {Object} instruction - 指令对象
     * @returns {boolean} 是否执行成功
     */
    function executeInsert(instruction) {
        const tables = getTables();
        if (instruction.tableIndex < 0 || instruction.tableIndex >= tables.length) {
            Logger.warn(TAG, `insertRow 失败：tableIndex ${instruction.tableIndex} 超出范围 (共 ${tables.length} 个表格)`);
            return false;
        }

        const table = tables[instruction.tableIndex];
        const template = getTemplateByUid(table.templateUid);
        if (!template) {
            Logger.warn(TAG, `insertRow 失败：找不到模板 ${table.templateUid}`);
            return false;
        }

        // 构建新行数据用于重复检测
        const newCells = new Array(template.columns.length).fill('');
        if (instruction.data && typeof instruction.data === 'object') {
            for (const [colIndex, value] of Object.entries(instruction.data)) {
                const idx = parseInt(colIndex, 10);
                if (!isNaN(idx) && idx >= 0 && idx < newCells.length) {
                    newCells[idx] = handleCellValue(value);
                }
            }
        }

        // 重复行检测（与 st-memory-enhancement 一致）
        const newRowStr = JSON.stringify(newCells);
        if (table.rows.some(row => JSON.stringify(row.cells) === newRowStr)) {
            Logger.log(TAG, `跳过重复插入: table ${instruction.tableIndex}, data ${newRowStr}`);
            return true; // 不算失败，只是跳过
        }

        const result = insertRow(table.uid, instruction.data);
        return result !== null;
    }

    /**
     * 执行更新指令（rowIndex 超出范围时回退为插入）
     * @param {Object} instruction - 指令对象
     * @returns {boolean} 是否执行成功
     */
    function executeUpdate(instruction) {
        const tables = getTables();
        if (instruction.tableIndex < 0 || instruction.tableIndex >= tables.length) {
            Logger.warn(TAG, `updateRow 失败：tableIndex ${instruction.tableIndex} 超出范围 (共 ${tables.length} 个表格)`);
            return false;
        }

        const table = tables[instruction.tableIndex];

        // 与 st-memory-enhancement 一致：rowIndex 超出范围时回退为 insert
        if (instruction.rowIndex >= table.rows.length) {
            Logger.log(TAG, `updateRow rowIndex ${instruction.rowIndex} 超出范围 (共 ${table.rows.length} 行)，回退为 insertRow`);
            return executeInsert({ ...instruction, type: 'insert' });
        }

        return updateRow(table.uid, instruction.rowIndex, instruction.data);
    }

    /**
     * 执行删除指令
     * @param {Object} instruction - 指令对象
     * @returns {boolean} 是否执行成功
     */
    function executeDelete(instruction) {
        const tables = getTables();
        if (instruction.tableIndex < 0 || instruction.tableIndex >= tables.length) {
            Logger.warn(TAG, `deleteRow 失败：tableIndex ${instruction.tableIndex} 超出范围 (共 ${tables.length} 个表格)`);
            return false;
        }

        const table = tables[instruction.tableIndex];
        return deleteRow(table.uid, instruction.rowIndex);
    }

    /**
     * 为指令排序（与 st-memory-enhancement sortActions 一致）
     * 排序优先级：update(0) → insert(1) → delete(2)
     * delete 操作按 rowIndex 降序排列，避免删除时索引偏移
     * @param {Array<Object>} instructions - 指令数组
     * @returns {Array<Object>} 排序后的指令数组
     */
    function sortInstructions(instructions) {
        const priority = { update: 0, insert: 1, delete: 2 };
        return [...instructions].sort((a, b) => {
            if (priority[a.type] === 2 && priority[b.type] === 2) {
                // 两个都是 delete，按 rowIndex 降序（先删大索引）
                return (b.rowIndex || 0) - (a.rowIndex || 0);
            }
            return (priority[a.type] || 0) - (priority[b.type] || 0);
        });
    }

    /**
     * 执行一组编辑指令（排序后执行）
     * @param {Array<Object>} instructions - 指令对象数组
     * @returns {boolean} 是否全部执行成功
     */
    function executeInstructions(instructions) {
        if (!Array.isArray(instructions) || instructions.length === 0) {
            return true;
        }

        // 排序：update → insert → delete（delete 按 rowIndex 降序）
        const sorted = sortInstructions(instructions);
        let allSuccess = true;

        for (const instruction of sorted) {
            let success = false;
            try {
                switch (instruction.type) {
                    case 'insert':
                        success = executeInsert(instruction);
                        break;
                    case 'update':
                        success = executeUpdate(instruction);
                        break;
                    case 'delete':
                        success = executeDelete(instruction);
                        break;
                    default:
                        Logger.warn(TAG, `未知指令类型: ${instruction.type}`);
                        break;
                }
            } catch (e) {
                Logger.error(TAG, `执行指令失败: ${JSON.stringify(instruction)}`, e);
                success = false;
            }

            if (!success) {
                allSuccess = false;
                Logger.warn(TAG, `指令执行失败: ${JSON.stringify(instruction)}`);
            }
        }

        return allSuccess;
    }

    /**
     * 从消息中提取并执行表格编辑指令（集成入口）
     * 模块禁用时跳过所有数据提取和执行
     * @param {string} message - AI 回复消息
     * @returns {{ content: string, executed: boolean }} 处理结果
     */
    function processMessageForTableEdits(message) {
        if (!isEnabled()) {
            return { content: message, executed: false };
        }

        const charConfig = getCharacterTableDisplayConfig();
        const contentTagName = charConfig.extractTag || 'content';
        const editTagName = charConfig.editTag || 'Amily2Edit';

        // 提取编辑指令标签（如 <Amily2Edit>...</Amily2Edit>）
        const extracted = extractTableEditTag(message, editTagName);
        if (!extracted.editString) {
            return { content: message, executed: false };
        }

        // 提取正文内容（如 <content>...</content>）
        const contentResult = extractContentTag(extracted.content, contentTagName);
        const content = contentResult.content || extracted.content;

        // 解析并执行指令
        const instructions = parseEditInstructions(extracted.editString);
        const executed = executeInstructions(instructions);

        return { content, executed };
    }

    // ==================== 消息接收拦截 ====================

    /**
     * MESSAGE_RECEIVED 事件处理：在消息渲染前提取编辑指令并更新表格
     * 同时将正文内容（去除标签）回写到消息对象，使渲染时只显示正文
     * @param {number} messageId - 消息 ID
     */
    function handleMessageReceived(messageId) {
        if (!isEnabled()) return;

        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];

            // 只处理 AI 消息
            if (!message || message.is_user) return;

            const originalMessage = message.mes || '';
            if (!originalMessage) return;

            // 重复性检查：如果编辑指令字符串没有变化，跳过（与 st-memory-enhancement isTableEditStrChanged 一致）
            const charConfig = getCharacterTableDisplayConfig();
            const editTagName = charConfig.editTag || 'Amily2Edit';
            const extracted = extractTableEditTag(originalMessage, editTagName);

            if (extracted.editString) {
                const editMatchKey = extracted.editString.trim();
                if (message._tableEditMatchKey && message._tableEditMatchKey === editMatchKey) {
                    return; // 编辑指令未变化，跳过
                }
                message._tableEditMatchKey = editMatchKey;
            }

            // 调用已有的提取+执行链路
            const result = processMessageForTableEdits(originalMessage);

            if (result.executed) {
                // 编辑指令已执行，用提取后的正文替换原始消息
                message.mes = result.content;

                // 同步更新 swipes
                if (message.swipes && message.swipe_id !== undefined) {
                    message.swipes[message.swipe_id] = result.content;
                }

                // 持久化表格数据
                saveConfig().catch(e => {
                    Logger.error(TAG, '自动填表后保存配置失败', e);
                });

                Logger.log(TAG, `消息 ${messageId} 自动填表完成，已更新表格数据并替换正文`);
                // 刷新主面板表格总览
                renderTableOverview();
            }
        } catch (e) {
            Logger.error(TAG, `处理消息 ${messageId} 时出错`, e);
        }
    }

    /**
     * MESSAGE_EDITED 事件处理：用户编辑消息后重新解析编辑指令
     * @param {number} messageId - 消息 ID
     */
    function handleMessageEdited(messageId) {
        if (!isEnabled()) return;

        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];

            if (!message || message.is_user) return;

            const originalMessage = message.mes || '';
            if (!originalMessage) return;

            // 强制重新解析（忽略重复性检查）
            const result = processMessageForTableEdits(originalMessage);

            if (result.executed) {
                message.mes = result.content;
                if (message.swipes && message.swipe_id !== undefined) {
                    message.swipes[message.swipe_id] = result.content;
                }
                saveConfig().catch(e => {
                    Logger.error(TAG, '编辑后保存配置失败', e);
                });
                Logger.log(TAG, `消息 ${messageId} 编辑后重新填表完成`);
            }
        } catch (e) {
            Logger.error(TAG, `处理编辑消息 ${messageId} 时出错`, e);
        }
    }

    /**
     * MESSAGE_SWIPED 事件处理：滑动切换消息后重新解析编辑指令
     * @param {number} messageId - 消息 ID
     */
    function handleMessageSwiped(messageId) {
        if (!isEnabled()) return;

        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];

            if (!message || message.is_user) return;

            const originalMessage = message.mes || '';
            if (!originalMessage) return;

            // 清除旧的匹配缓存，强制重新解析
            delete message._tableEditMatchKey;

            const result = processMessageForTableEdits(originalMessage);

            if (result.executed) {
                message.mes = result.content;
                if (message.swipes && message.swipe_id !== undefined) {
                    message.swipes[message.swipe_id] = result.content;
                }
                saveConfig().catch(e => {
                    Logger.error(TAG, 'swipe 后保存配置失败', e);
                });
                Logger.log(TAG, `消息 ${messageId} swipe 后重新填表完成`);
            }
        } catch (e) {
            Logger.error(TAG, `处理 swipe 消息 ${messageId} 时出错`, e);
        }
    }

    // ==================== 填表引擎 (Batch Fill Engine) ====================

    /**
     * 将当前所有表格数据格式化为文本，供 AI 提示词使用
     * 格式与 st-memory-enhancement 的 getTablePromptByPiece 对齐：
     *   Table {index} ({name}): {description}
     *   Columns: col0, col1, ...
     *   Config: insertNode / updateNode / deleteNode / note
     *   Row 0: cell0, cell1, ...
     * @returns {string} 格式化后的表格文本
     */
    function getTableDataText() {
        const tables = getTables();
        if (!tables || tables.length === 0) return '(无表格数据)';

        const parts = [];
        tables.forEach((tableData, index) => {
            const template = getTemplateByUid(tableData.templateUid);
            const columns = template ? template.columns : [];
            const config = template ? (template.config || {}) : {};
            const desc = template ? (template.description || '') : '';

            let section = `Table ${index} (${tableData.name})`;
            if (desc) section += `: ${desc}`;
            section += '\n';

            // 列头
            if (columns.length > 0) {
                section += `Columns: ${columns.join(', ')}\n`;
            }

            // 配置规则（insertNode / updateNode / deleteNode / note）
            const rules = [];
            if (config.note) rules.push(`note: ${config.note}`);
            if (config.insertNode) rules.push(`insertNode: ${config.insertNode}`);
            if (config.updateNode) rules.push(`updateNode: ${config.updateNode}`);
            if (config.deleteNode) rules.push(`deleteNode: ${config.deleteNode}`);
            if (rules.length > 0) {
                section += rules.join('; ') + '\n';
            }

            // 数据行
            if (tableData.rows && tableData.rows.length > 0) {
                tableData.rows.forEach((row, rowIdx) => {
                    const cells = (row.cells || []).map(c => c ?? '');
                    section += `Row ${rowIdx}: ${cells.join(', ')}\n`;
                });
            } else {
                section += '(空表)\n';
            }

            parts.push(section);
        });

        return parts.join('\n');
    }

    /**
     * 获取最近的聊天记录文本
     * 移植自 st-memory-enhancement absoluteRefresh.js getRecentChatHistory
     * @param {number} [maxMessages=20] - 最大消息条数
     * @param {boolean} [ignoreUser=false] - 是否忽略用户消息
     * @returns {string} 格式化后的聊天记录
     */
    function getRecentChatHistory(maxMessages = 20, ignoreUser = false) {
        try {
            const context = SillyTavern.getContext();
            const chat = context.chat || [];
            if (chat.length === 0) return '(无聊天记录)';

            let filtered = chat;
            if (ignoreUser) {
                filtered = chat.filter(c => !c.is_user);
            }

            const collected = [];
            // 从最新消息逆序收集
            for (let i = filtered.length - 1; i >= 0 && collected.length < maxMessages; i--) {
                const msg = filtered[i];
                const name = msg.name || (msg.is_user ? 'User' : 'AI');
                // 清理编辑指令标签，只保留正文
                const text = (msg.mes || '')
                    .replace(/<Amily2Edit>[\s\S]*?<\/Amily2Edit>/g, '')
                    .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '')
                    .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
                    .trim();
                if (text) {
                    collected.push(`${name}: ${text}`);
                }
            }

            return collected.reverse().join('\n');
        } catch (e) {
            Logger.error(TAG, '获取聊天记录失败', e);
            return '(获取聊天记录失败)';
        }
    }

    /**
     * 获取世界书内容（如果可用）
     * @returns {Promise<string>} 世界书文本
     */
    async function getWorldBookContent() {
        try {
            if (typeof WBAP.API?.getAllWorldBookNames !== 'function') return '';
            const names = await WBAP.API.getAllWorldBookNames();
            if (!names || names.length === 0) return '';

            const parts = [];
            for (const name of names) {
                const entries = await WBAP.API.loadWorldBookEntriesByName(name);
                if (entries) {
                    const entryValues = Object.values(entries);
                    for (const entry of entryValues) {
                        if (entry.content && !entry.disable) {
                            parts.push(entry.content);
                        }
                    }
                }
            }
            return parts.join('\n');
        } catch (e) {
            Logger.warn(TAG, '获取世界书内容失败（非致命）', e);
            return '';
        }
    }

    /**
     * 根据预设 key 组装完整的 prompt 消息数组
     * 读取 globalConfig.promptPresets[presetKey]，按 mixedOrder 顺序组装
     * 替换 {{{Amily2TableData}}} 等占位符
     * 
     * @param {string} presetKey - 预设 key: 'batch' | 'single' | 'reorg'
     * @param {Object} [vars={}] - 额外变量替换
     * @returns {Promise<Array<{role: string, content: string}>>} 消息数组
     */
    async function assemblePromptMessages(presetKey, vars = {}) {
        const globalConfig = getGlobalTableDisplayConfig();
        const presets = globalConfig.promptPresets;

        // 准备变量
        const tableDataText = getTableDataText();
        const chatHistory = getRecentChatHistory(vars.maxMessages || 20);
        let userName = 'User';
        let charName = 'AI';
        try {
            const context = SillyTavern.getContext();
            userName = context.name1 || 'User';
            charName = context.name2 || 'AI';
        } catch (_) {}

        const replacePlaceholders = (text) => {
            if (typeof text !== 'string') return text;
            return text
                .replace(/\{\{\{Amily2TableData\}\}\}/g, tableDataText)
                .replace(/\{current_table\}/g, tableDataText)
                .replace(/\{chat_history\}/g, chatHistory)
                .replace(/\{user_name\}/g, userName)
                .replace(/\{char_name\}/g, charName);
        };

        // 如果有完整预设结构（promptPresets），使用 mixedOrder 组装
        if (presets && presets[presetKey]) {
            const preset = presets[presetKey];
            const prompts = preset.prompts || [];
            const mixedOrder = preset.mixedOrder || [];

            if (mixedOrder.length === 0) {
                // 无 mixedOrder，直接按 prompts 顺序
                return prompts.map(p => ({
                    role: p.role || 'system',
                    content: replacePlaceholders(p.content || '')
                }));
            }

            const messages = [];
            // 预加载条件内容
            const worldbook = vars.worldbook || await getWorldBookContent();
            const ruleTemplate = globalConfig.amily2Meta?.batchFillerRuleTemplate || '';
            const flowTemplate = globalConfig.amily2Meta?.batchFillerFlowTemplate || '';

            for (const entry of mixedOrder) {
                if (entry.type === 'prompt') {
                    const idx = entry.index;
                    if (prompts[idx]) {
                        messages.push({
                            role: prompts[idx].role || 'system',
                            content: replacePlaceholders(prompts[idx].content || '')
                        });
                    }
                } else if (entry.type === 'conditional') {
                    let content = '';
                    switch (entry.id) {
                        case 'worldbook':
                            content = worldbook;
                            break;
                        case 'ruleTemplate':
                            content = ruleTemplate;
                            break;
                        case 'flowTemplate':
                            content = flowTemplate;
                            break;
                        case 'coreContent':
                            // 最近的核心聊天内容（用于 batch 模式）
                            content = chatHistory;
                            break;
                        case 'contextHistory':
                            // 上下文历史（用于 single 模式）
                            content = chatHistory;
                            break;
                    }
                    if (content) {
                        messages.push({
                            role: 'system',
                            content: replacePlaceholders(content)
                        });
                    }
                }
            }

            return messages;
        }

        // 回退：使用简单的 promptTemplates 字符串
        const simpleTemplate = globalConfig.promptTemplates?.[presetKey] || '';
        if (simpleTemplate) {
            return [
                { role: 'system', content: replacePlaceholders(simpleTemplate) }
            ];
        }

        // 最终回退
        return [
            { role: 'system', content: `请根据聊天记录更新表格数据。\n\n${tableDataText}\n\n聊天记录：\n${chatHistory}` }
        ];
    }

    /**
     * 批量填表主入口
     * 组装提示词 → 调用 AI → 提取 <Amily2Edit> → 解析指令 → 执行 → 保存
     * 
     * @param {string} [mode='batch'] - 填表模式: 'batch' | 'single' | 'reorg'
     * @param {Object} [options={}] - 可选参数
     * @param {AbortSignal} [options.signal] - 取消信号
     * @param {Function} [options.onProgress] - 进度回调
     * @param {Function} [options.onToken] - 流式 token 回调
     * @returns {Promise<{success: boolean, message: string, instructionCount?: number}>}
     */
    async function batchFillTables(mode = 'batch', options = {}) {
        if (!isEnabled()) {
            return { success: false, message: '表格模块未启用' };
        }

        const tables = getTables();
        if (!tables || tables.length === 0) {
            return { success: false, message: '无表格数据，请先创建表格' };
        }

        const globalConfig = getGlobalTableDisplayConfig();
        const apiConfig = { ...(globalConfig.apiConfig || {}) };

        // 注入可选参数
        if (options.signal) apiConfig.signal = options.signal;
        if (options.onProgress) apiConfig.onProgress = options.onProgress;
        if (options.onToken) apiConfig.onToken = options.onToken;

        const modeNames = { batch: '批量填表', single: '分步填表', reorg: '表格重整理' };
        const modeName = modeNames[mode] || mode;

        Logger.log(TAG, `开始${modeName}...`);

        try {
            // 1. 组装提示词消息数组
            const messages = await assemblePromptMessages(mode);
            if (!messages || messages.length === 0) {
                return { success: false, message: '提示词组装失败：无有效消息' };
            }

            Logger.log(TAG, `提示词组装完成，共 ${messages.length} 条消息`);

            // 2. 拼接为 callAI 所需的 systemPrompt + userPrompt
            //    策略：所有 system 消息合并为 systemPrompt，最后一条 user/assistant 消息作为 userPrompt
            //    如果全是 system，则最后一条作为 userPrompt
            let systemPrompt = '';
            let userPrompt = '';

            const systemMessages = messages.filter(m => m.role === 'system');
            const nonSystemMessages = messages.filter(m => m.role !== 'system');

            if (nonSystemMessages.length > 0) {
                systemPrompt = systemMessages.map(m => m.content).join('\n\n');
                userPrompt = nonSystemMessages.map(m => m.content).join('\n\n');
            } else if (systemMessages.length > 1) {
                // 全是 system：前 N-1 条合并为 systemPrompt，最后一条作为 userPrompt
                systemPrompt = systemMessages.slice(0, -1).map(m => m.content).join('\n\n');
                userPrompt = systemMessages[systemMessages.length - 1].content;
            } else {
                // 只有一条
                userPrompt = systemMessages[0]?.content || '';
            }

            // 3. 调用 AI
            Logger.log(TAG, `调用 AI (${apiConfig.model || 'default'})...`);

            // 检查 callAI 是否可用
            if (typeof WBAP.callAI !== 'function') {
                return { success: false, message: '批量填表失败: API 模块未加载（WBAP.callAI 不存在）' };
            }

            let rawContent;
            try {
                rawContent = await WBAP.callAI(
                    apiConfig.model || '',
                    userPrompt,
                    systemPrompt,
                    apiConfig
                );
            } catch (aiErr) {
                Logger.error(TAG, '调用 AI 失败', aiErr);
                return { success: false, message: `调用 AI 失败: ${aiErr.message || aiErr}` };
            }

            // 兼容返回对象的情况（某些 ST 版本 generate 返回 {content: "..."} ）
            if (rawContent && typeof rawContent === 'object') {
                rawContent = rawContent.content || rawContent.response || rawContent.output || JSON.stringify(rawContent);
            }

            if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
                const hasApiUrl = !!(apiConfig.apiUrl || apiConfig.url);
                if (!hasApiUrl && !apiConfig.model) {
                    return { success: false, message: 'AI 返回内容为空。请先在「全局设置」中配置 API 地址和模型，或确保 SillyTavern 已连接到 API。' };
                }
                return { success: false, message: 'AI 返回内容为空，请检查 API 连接状态' };
            }

            Logger.log(TAG, `AI 返回内容长度: ${rawContent.length}`);

            // 4. 提取编辑指令
            const charConfig = getCharacterTableDisplayConfig();
            const editTagName = charConfig.editTag || 'Amily2Edit';
            const extracted = extractTableEditTag(rawContent, editTagName);

            if (!extracted.editString) {
                // 也尝试 tableEdit 标签（兼容 st-memory-enhancement 格式）
                const fallback = extractTableEditTag(rawContent, 'tableEdit');
                if (!fallback.editString) {
                    Logger.warn(TAG, `${modeName}：AI 未返回有效的编辑指令`);
                    return { success: true, message: `${modeName}完成，但 AI 未返回编辑指令，表格未变化` };
                }
                extracted.editString = fallback.editString;
            }

            // 5. 解析并执行指令
            const instructions = parseEditInstructions(extracted.editString);
            if (instructions.length === 0) {
                return { success: true, message: `${modeName}完成，未解析到有效指令` };
            }

            const executed = executeInstructions(instructions);
            Logger.log(TAG, `${modeName}执行完成: ${instructions.length} 条指令`);

            // 6. 保存
            await saveConfig();

            // 7. 刷新消息中的表格渲染 + 主面板总览
            try {
                const context = SillyTavern.getContext();
                const lastMsgId = (context.chat || []).length - 1;
                if (lastMsgId >= 0) {
                    renderTableInMessage(lastMsgId);
                }
            } catch (_) {}
            renderTableOverview();

            return {
                success: true,
                message: `${modeName}完成，执行了 ${instructions.length} 条指令`,
                instructionCount: instructions.length
            };

        } catch (e) {
            Logger.error(TAG, `${modeName}失败`, e);
            return { success: false, message: `${modeName}失败: ${e.message}` };
        }
    }

    /**
     * 注入表格数据到 CHAT_COMPLETION_PROMPT_READY 事件
     * 使 AI 在正常对话时也能看到表格数据（只读注入，不触发填表）
     * 移植自 st-memory-enhancement onChatCompletionPromptReady
     * @param {Object} eventData - SillyTavern 事件数据，包含 chat 数组
     */
    function injectTableDataToPrompt(eventData) {
        if (!isEnabled()) return;
        if (!eventData || !eventData.chat) return;

        try {
            const tableDataText = getTableDataText();
            if (!tableDataText || tableDataText === '(无表格数据)') return;

            const injection = {
                role: 'system',
                content: `以下是通过表格记录的当前场景信息以及历史记录信息，你需要以此为参考进行回复，并在回复中使用 <Amily2Edit> 标签输出表格更新指令：\n${tableDataText}`
            };

            // 注入到倒数第二个位置（在用户最新消息之前）
            const insertPos = Math.max(0, eventData.chat.length - 1);
            eventData.chat.splice(insertPos, 0, injection);

            Logger.log(TAG, '表格数据已注入到对话提示词');
        } catch (e) {
            Logger.error(TAG, '注入表格数据失败', e);
        }
    }

    // ==================== 设置面板 UI ====================

    /**
     * 确保设置面板模态框已注入 DOM
     * @returns {HTMLElement|null} 模态框元素
     */
    function ensureSettingsModal() {
        let modal = document.getElementById('wbap-table-manager');
        if (modal) return modal;

        const templates = WBAP.UI_TEMPLATES;
        if (!templates || !templates.TABLE_MANAGER_HTML) {
            Logger.warn(TAG, 'TABLE_MANAGER_HTML 模板不可用');
            return null;
        }

        const div = document.createElement('div');
        div.innerHTML = templates.TABLE_MANAGER_HTML;
        document.body.appendChild(div.firstElementChild);
        modal = document.getElementById('wbap-table-manager');

        if (modal) {
            bindSettingsPanelEvents(modal);
            Logger.log(TAG, '设置面板已注入');
        }
        return modal;
    }

    /**
     * 绑定设置面板所有事件
     * @param {HTMLElement} modal - 模态框元素
     */
    function bindSettingsPanelEvents(modal) {
        // 关闭按钮
        modal.querySelector('#wbap-table-manager-close')?.addEventListener('click', () => {
            modal.classList.remove('open');
        });

        // 导航 tab 切换
        modal.querySelectorAll('.wbap-table-nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const navKey = tab.getAttribute('data-nav');
                modal.querySelectorAll('.wbap-table-nav-tab').forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.wbap-table-nav-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = modal.querySelector(`.wbap-table-nav-panel[data-panel="${navKey}"]`);
                if (panel) panel.classList.add('active');
            });
        });

        // === 8.1 模块启用开关 ===
        const enabledToggle = modal.querySelector('#wbap-table-module-enabled');
        if (enabledToggle) {
            enabledToggle.addEventListener('change', () => {
                setEnabled(enabledToggle.checked);
                renderTableOverview();
                refreshTableList(modal);
            });
        }

        // === 8.1 聊天内显示表格开关 ===
        const showInChatToggle = modal.querySelector('#wbap-table-show-in-chat');
        if (showInChatToggle) {
            showInChatToggle.addEventListener('change', () => {
                const charConfig = getCharacterTableDisplayConfig();
                charConfig.renderInMessage = showInChatToggle.checked;
                saveConfig();
            });
        }

        // === 8.1 标签提取配置 ===
        const extractTagInput = modal.querySelector('#wbap-table-extract-tag');
        if (extractTagInput) {
            extractTagInput.addEventListener('change', () => {
                const charConfig = getCharacterTableDisplayConfig();
                charConfig.extractTag = extractTagInput.value.trim() || 'content';
                saveConfig();
            });
        }

        // === 8.1 编辑指令标签配置 ===
        const editTagInput = modal.querySelector('#wbap-table-edit-tag');
        if (editTagInput) {
            editTagInput.addEventListener('change', () => {
                const charConfig = getCharacterTableDisplayConfig();
                charConfig.editTag = editTagInput.value.trim() || 'Amily2Edit';
                saveConfig();
            });
        }

        // === 8.2 预设导入（直接创建表格） ===
        const tplImportBtn = modal.querySelector('#wbap-table-tpl-import-btn');
        const tplFileInput = modal.querySelector('#wbap-table-tpl-file-input');
        if (tplImportBtn && tplFileInput) {
            tplImportBtn.addEventListener('click', () => tplFileInput.click());
            tplFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const result = importTemplate(ev.target.result);
                    if (result) {
                        try {
                            await saveConfig();
                            Logger.log(TAG, '导入后配置已持久化');
                        } catch (e) {
                            Logger.error(TAG, '导入后保存失败', e);
                        }
                        refreshTableList(modal);
                        renderTableOverview();
                        if (Array.isArray(result)) {
                            Logger.log(TAG, `批量导入成功: ${result.length} 个模板`);
                            try { toastr?.success?.(`成功导入 ${result.length} 个表格`); } catch (_) {}
                        } else {
                            Logger.log(TAG, '模板导入成功:', result.name);
                            try { toastr?.success?.(`导入成功: ${result.name}`); } catch (_) {}
                        }
                    } else {
                        Logger.warn(TAG, '模板导入失败');
                        try { toastr?.warning?.('预设格式无效'); } catch (_) {}
                    }
                };
                reader.readAsText(file);
                tplFileInput.value = '';
            });
        }

        // === 8.3 添加行 ===
        const addRowBtn = modal.querySelector('#wbap-table-add-row-btn');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', () => {
                if (!state.currentEditingTable) return;
                const row = insertRow(state.currentEditingTable, {});
                if (row) {
                    saveConfig();
                    renderTableEditor(modal, state.currentEditingTable);
                }
            });
        }

        // === 全局设置 tab 的预设导入/导出 ===
        const globalImportBtn = modal.querySelector('#wbap-table-import-btn');
        const globalFileInput = modal.querySelector('#wbap-table-file-input');
        if (globalImportBtn && globalFileInput) {
            globalImportBtn.addEventListener('click', () => globalFileInput.click());
            globalFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const result = importTemplate(ev.target.result);
                    if (result) {
                        try {
                            await saveConfig();
                        } catch (err) {
                            Logger.error(TAG, '导入后保存失败', err);
                        }
                        // 刷新表格列表
                        refreshTableList(modal);
                        renderTableOverview();
                        // 自动切换到"表格编辑" tab
                        const operationTab = modal.querySelector('.wbap-table-nav-tab[data-nav="operation"]');
                        if (operationTab) operationTab.click();

                        const count = Array.isArray(result) ? result.length : 1;
                        const name = Array.isArray(result) ? `${count} 个表格` : result.name;
                        try { toastr?.success?.(`导入成功: ${name}`); } catch (_) {}
                    } else {
                        try { toastr?.warning?.('预设格式无效'); } catch (_) {}
                    }
                };
                reader.readAsText(file);
                globalFileInput.value = '';
            });
        }

        const globalExportBtn = modal.querySelector('#wbap-table-export-btn');
        if (globalExportBtn) {
            globalExportBtn.addEventListener('click', () => {
                const globalConfig = getGlobalTableDisplayConfig();
                const tables = globalConfig.tables || [];
                const templates = globalConfig.templates || [];
                if (tables.length === 0 && templates.length === 0) {
                    try { toastr?.warning?.('暂无表格数据可导出'); } catch (_) {}
                    return;
                }

                // 导出为 Amily2 兼容格式
                const exportData = {
                    version: 'WBAP-TableExport-v1.0',
                    tables: templates.map(tpl => {
                        const tblData = tables.find(t => t.templateUid === tpl.uid);
                        return {
                            name: tpl.name,
                            headers: [...tpl.columns],
                            note: tpl.description || '',
                            rule_add: tpl.config?.insertNode || '',
                            rule_update: tpl.config?.updateNode || '',
                            rule_delete: tpl.config?.deleteNode || '',
                            content: tblData ? (tblData.rows || []).map(r => r.cells || []) : []
                        };
                    })
                };

                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `table_preset_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
                try { toastr?.success?.(`已导出 ${templates.length} 个表格`); } catch (_) {}
            });
        }

        // === 8.4 API 配置 ===
        const apiSourceSelect = modal.querySelector('#wbap-table-api-source');
        if (apiSourceSelect) {
            apiSourceSelect.addEventListener('change', () => {
                const directConfig = modal.querySelector('#wbap-table-api-direct-config');
                if (directConfig) {
                    directConfig.style.display = apiSourceSelect.value === 'direct' ? 'block' : 'none';
                }
                saveApiConfig(modal);
            });
        }

        // API 字段变更自动保存
        ['wbap-table-api-url', 'wbap-table-api-key', 'wbap-table-api-model'].forEach(id => {
            const el = modal.querySelector(`#${id}`);
            if (el) el.addEventListener('change', () => saveApiConfig(modal));
        });

        // === 提示词模板 sub-tab 切换 ===
        let currentPromptTab = 'batch';
        const promptEditor = modal.querySelector('#wbap-table-prompt-editor');
        const subTabs = modal.querySelectorAll('.wbap-sub-tab[data-sub]');

        function loadPromptToEditor(tabKey) {
            if (!promptEditor) return;
            const globalConfig = getGlobalTableDisplayConfig();
            const templates = globalConfig.promptTemplates || {};
            promptEditor.value = templates[tabKey] || '';
            currentPromptTab = tabKey;
        }

        if (subTabs.length > 0 && promptEditor) {
            subTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    subTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    loadPromptToEditor(tab.getAttribute('data-sub'));
                });
            });
            // 初始加载 batch
            loadPromptToEditor('batch');
        }

        // === 保存提示词 ===
        const savePromptBtn = modal.querySelector('#wbap-save-prompt');
        if (savePromptBtn && promptEditor) {
            savePromptBtn.addEventListener('click', async () => {
                const globalConfig = getGlobalTableDisplayConfig();
                if (!globalConfig.promptTemplates) globalConfig.promptTemplates = {};
                globalConfig.promptTemplates[currentPromptTab] = promptEditor.value;
                try {
                    await saveConfig();
                    const names = { batch: '批量填表', single: '单次填表', reorg: '重整理' };
                    try { toastr?.success?.(`${names[currentPromptTab] || currentPromptTab} 提示词已保存`); } catch (_) {}
                } catch (e) {
                    Logger.error(TAG, '保存提示词失败', e);
                    try { toastr?.error?.('保存失败'); } catch (_) {}
                }
            });
        }

        // === 变量标签点击插入 ===
        modal.querySelectorAll('.wbap-var-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                if (!promptEditor) return;
                const varText = tag.textContent;
                const start = promptEditor.selectionStart;
                const end = promptEditor.selectionEnd;
                const val = promptEditor.value;
                promptEditor.value = val.substring(0, start) + varText + val.substring(end);
                promptEditor.selectionStart = promptEditor.selectionEnd = start + varText.length;
                promptEditor.focus();
            });
        });

        // === 执行填表按钮 ===
        const fillStatusEl = modal.querySelector('#wbap-fill-status');
        const showFillStatus = (text, isError = false) => {
            if (!fillStatusEl) return;
            fillStatusEl.style.display = 'block';
            fillStatusEl.style.color = isError ? '#ef4444' : 'var(--wbap-text-muted,#94a3b8)';
            fillStatusEl.textContent = text;
        };

        const execFill = async (mode, btn) => {
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 执行中...';
            showFillStatus(`正在执行${mode === 'batch' ? '批量填表' : mode === 'single' ? '分步填表' : '重整理'}...`);

            try {
                const result = await batchFillTables(mode);
                if (result.success) {
                    showFillStatus(result.message);
                    try { toastr?.success?.(result.message); } catch (_) {}
                    // 刷新表格列表
                    refreshTableList(modal);
                } else {
                    showFillStatus(result.message, true);
                    try { toastr?.error?.(result.message); } catch (_) {}
                }
            } catch (e) {
                showFillStatus(`执行失败: ${e.message}`, true);
                try { toastr?.error?.(`执行失败: ${e.message}`); } catch (_) {}
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        };

        const execBatchBtn = modal.querySelector('#wbap-exec-batch');
        if (execBatchBtn) execBatchBtn.addEventListener('click', () => execFill('batch', execBatchBtn));

        const execSingleBtn = modal.querySelector('#wbap-exec-single');
        if (execSingleBtn) execSingleBtn.addEventListener('click', () => execFill('single', execSingleBtn));

        const execReorgBtn = modal.querySelector('#wbap-exec-reorg');
        if (execReorgBtn) execReorgBtn.addEventListener('click', () => execFill('reorg', execReorgBtn));
    }


    /**
     * 加载设置到 UI
     * @param {HTMLElement} modal - 模态框元素
     */
    function loadSettingsToPanel(modal) {
        const charConfig = getCharacterTableDisplayConfig();
        const globalConfig = getGlobalTableDisplayConfig();

        // 模块启用状态
        const enabledToggle = modal.querySelector('#wbap-table-module-enabled');
        if (enabledToggle) enabledToggle.checked = charConfig.enabled === true;

        // 聊天内显示
        const showInChat = modal.querySelector('#wbap-table-show-in-chat');
        if (showInChat) showInChat.checked = charConfig.renderInMessage !== false;

        // 标签提取
        const extractTag = modal.querySelector('#wbap-table-extract-tag');
        if (extractTag) extractTag.value = charConfig.extractTag || 'content';

        // 编辑指令标签
        const editTag = modal.querySelector('#wbap-table-edit-tag');
        if (editTag) editTag.value = charConfig.editTag || 'Amily2Edit';

        // API 配置
        const apiConfig = globalConfig.apiConfig || {};
        const apiSource = modal.querySelector('#wbap-table-api-source');
        if (apiSource) {
            apiSource.value = apiConfig.apiUrl ? 'direct' : 'st_backend';
            const directConfig = modal.querySelector('#wbap-table-api-direct-config');
            if (directConfig) directConfig.style.display = apiConfig.apiUrl ? 'block' : 'none';
        }
        const apiUrl = modal.querySelector('#wbap-table-api-url');
        if (apiUrl) apiUrl.value = apiConfig.apiUrl || '';
        const apiKey = modal.querySelector('#wbap-table-api-key');
        if (apiKey) apiKey.value = apiConfig.apiKey || '';
        const apiModel = modal.querySelector('#wbap-table-api-model');
        if (apiModel) apiModel.value = apiConfig.model || '';

        // 刷新列表
        refreshTableList(modal);

        // 加载提示词模板（加载当前活跃 tab 的内容）
        const promptEditor = modal.querySelector('#wbap-table-prompt-editor');
        const activeSubTab = modal.querySelector('.wbap-sub-tab.active');
        if (promptEditor && activeSubTab) {
            const tabKey = activeSubTab.getAttribute('data-sub') || 'batch';
            const templates = globalConfig.promptTemplates || {};
            promptEditor.value = templates[tabKey] || '';
        }

        // 刷新表格总览
        renderTableOverview();
    }

    /**
     * 保存 API 配置
     * @param {HTMLElement} modal - 模态框元素
     */
    function saveApiConfig(modal) {
        const globalConfig = getGlobalTableDisplayConfig();
        const apiSource = modal.querySelector('#wbap-table-api-source')?.value;

        if (apiSource === 'direct') {
            globalConfig.apiConfig.apiUrl = modal.querySelector('#wbap-table-api-url')?.value || '';
            globalConfig.apiConfig.apiKey = modal.querySelector('#wbap-table-api-key')?.value || '';
        } else {
            globalConfig.apiConfig.apiUrl = '';
            globalConfig.apiConfig.apiKey = '';
        }
        globalConfig.apiConfig.model = modal.querySelector('#wbap-table-api-model')?.value || '';
        saveConfig();
    }

    // ==================== 8.3 表格管理 UI ====================

    /**
     * 刷新表格列表（概览模式：显示序号、名称、列头）
     * @param {HTMLElement} modal - 模态框元素
     */
    function refreshTableList(modal) {
        const container = modal.querySelector('#wbap-table-list');
        if (!container) return;

        const tables = getTables();
        if (!tables || tables.length === 0) {
            container.innerHTML = '<p class="wbap-text-muted" style="text-align:center;font-size:12px;">暂无表格</p>';
            return;
        }

        container.innerHTML = '';
        tables.forEach((tbl, index) => {
            const item = document.createElement('div');
            const isActive = state.currentEditingTable === tbl.uid;
            item.style.cssText = `padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--SmartThemeBorderColor,#444);${isActive ? 'background:var(--SmartThemeBlurTintColor,#333);' : ''}`;

            item.addEventListener('click', () => {
                selectTableForEditing(modal, tbl.uid);
            });

            // 标题行：#序号 表格名 + 行数 + 删除按钮
            const header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:6px;';

            const title = document.createElement('div');
            title.style.cssText = 'flex:1;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--SmartThemeBodyColor,#eee);';
            title.textContent = `#${index} ${tbl.name}`;

            const rowCount = document.createElement('span');
            rowCount.style.cssText = 'font-size:11px;color:var(--wbap-text-muted,#888);white-space:nowrap;flex-shrink:0;';
            rowCount.textContent = `${tbl.rows ? tbl.rows.length : 0} 行`;

            const deleteBtn = document.createElement('button');
            deleteBtn.style.cssText = 'flex-shrink:0;width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:#f87171;cursor:pointer;border-radius:4px;font-size:12px;';
            deleteBtn.title = '删除表格';
            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.background = 'hsla(0,60%,40%,0.3)'; });
            deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.background = 'transparent'; });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`确定删除表格 "${tbl.name}" 吗？`)) {
                    deleteTable(tbl.uid);
                    saveConfig();
                    if (state.currentEditingTable === tbl.uid) {
                        state.currentEditingTable = null;
                        clearTableEditor(modal);
                    }
                    refreshTableList(modal);
                }
            });

            header.appendChild(title);
            header.appendChild(rowCount);
            header.appendChild(deleteBtn);

            // 列头预览行
            const template = getTemplateByUid(tbl.templateUid);
            const columns = template ? template.columns : [];
            const colPreview = document.createElement('div');
            colPreview.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;';
            columns.forEach(col => {
                const tag = document.createElement('span');
                tag.style.cssText = 'font-size:11px;padding:1px 6px;background:var(--SmartThemeBlurTintColor,#333);border:1px solid var(--SmartThemeBorderColor,#555);border-radius:3px;color:var(--SmartThemeBodyColor,#ccc);';
                tag.textContent = col;
                colPreview.appendChild(tag);
            });

            item.appendChild(header);
            item.appendChild(colPreview);
            container.appendChild(item);
        });
    }

    /**
     * 选择表格进行编辑
     * @param {HTMLElement} modal - 模态框元素
     * @param {string} tableUid - 表格 UID
     */
    function selectTableForEditing(modal, tableUid) {
        state.currentEditingTable = tableUid;
        refreshTableList(modal);
        renderTableEditor(modal, tableUid);

        const addRowBtn = modal.querySelector('#wbap-table-add-row-btn');
        if (addRowBtn) addRowBtn.style.display = 'inline-flex';
    }

    /**
     * 清空表格编辑区
     * @param {HTMLElement} modal - 模态框元素
     */
    function clearTableEditor(modal) {
        const gridArea = modal.querySelector('#wbap-table-grid-area');
        if (gridArea) {
            gridArea.innerHTML = '<p class="wbap-text-muted" style="text-align:center;font-size:12px;padding:16px;">请从上方选择一个表格</p>';
        }
        const title = modal.querySelector('#wbap-table-edit-title');
        if (title) title.textContent = '表格数据';
        const addRowBtn = modal.querySelector('#wbap-table-add-row-btn');
        if (addRowBtn) addRowBtn.style.display = 'none';
    }

    /**
     * 渲染表格编辑器（可编辑单元格 + 行操作）
     * @param {HTMLElement} modal - 模态框元素
     * @param {string} tableUid - 表格 UID
     */
    function renderTableEditor(modal, tableUid) {
        const gridArea = modal.querySelector('#wbap-table-grid-area');
        if (!gridArea) return;

        const tableData = getTable(tableUid);
        if (!tableData) {
            gridArea.innerHTML = '<p class="wbap-text-muted" style="text-align:center;font-size:12px;padding:16px;">表格不存在</p>';
            return;
        }

        const title = modal.querySelector('#wbap-table-edit-title');
        if (title) title.textContent = tableData.name || '表格数据';

        const template = getTemplateByUid(tableData.templateUid);
        const columns = template ? template.columns : [];

        gridArea.innerHTML = '';

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';

        // 表头
        if (columns.length > 0) {
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            for (const col of columns) {
                const th = document.createElement('th');
                th.textContent = col;
                th.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:4px 6px;background:var(--SmartThemeBlurTintColor,#333);text-align:left;font-weight:bold;position:sticky;top:0;';
                headerRow.appendChild(th);
            }
            // 操作列
            const thAction = document.createElement('th');
            thAction.textContent = '操作';
            thAction.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:4px 6px;background:var(--SmartThemeBlurTintColor,#333);text-align:center;font-weight:bold;width:50px;position:sticky;top:0;';
            headerRow.appendChild(thAction);
            thead.appendChild(headerRow);
            table.appendChild(thead);
        }

        // 数据行
        const tbody = document.createElement('tbody');
        const colCount = columns.length || (tableData.rows[0] ? tableData.rows[0].cells.length : 1);

        if (!tableData.rows || tableData.rows.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = colCount + 1;
            td.textContent = '（无数据，点击"添加行"开始）';
            td.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:8px;text-align:center;color:var(--wbap-text-muted,#888);';
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            tableData.rows.forEach((row, rowIndex) => {
                const tr = document.createElement('tr');
                for (let colIdx = 0; colIdx < colCount; colIdx++) {
                    const td = document.createElement('td');
                    td.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:2px 4px;';
                    td.contentEditable = 'true';
                    td.textContent = (row.cells && row.cells[colIdx] != null) ? row.cells[colIdx] : '';
                    td.setAttribute('data-row', rowIndex);
                    td.setAttribute('data-col', colIdx);

                    // 单元格编辑保存
                    td.addEventListener('blur', () => {
                        const newVal = td.textContent;
                        const r = parseInt(td.getAttribute('data-row'));
                        const c = parseInt(td.getAttribute('data-col'));
                        updateCell(tableUid, r, c, newVal);
                        saveConfig();
                    });

                    tr.appendChild(td);
                }

                // 删除行按钮
                const tdAction = document.createElement('td');
                tdAction.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:2px;text-align:center;';
                const delBtn = document.createElement('button');
                delBtn.className = 'wbap-btn wbap-btn-xs wbap-btn-danger';
                delBtn.title = '删除行';
                delBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                delBtn.addEventListener('click', () => {
                    deleteRow(tableUid, rowIndex);
                    saveConfig();
                    renderTableEditor(modal, tableUid);
                });
                tdAction.appendChild(delBtn);
                tr.appendChild(tdAction);

                tbody.appendChild(tr);
            });
        }

        table.appendChild(tbody);
        gridArea.appendChild(table);
    }

    /**
     * HTML 转义
     * @param {string} str - 原始字符串
     * @returns {string} 转义后的字符串
     */
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ==================== 消息渲染器 ====================

    /**
     * 渲染单个表格内容为 CSV 风格 HTML
     * @param {Object} tableData - 表格数据对象
     * @returns {HTMLElement} 表格内容容器
     */
    function renderTableContent(tableData) {
        const container = document.createElement('div');
        container.className = 'wbap-td-table-content';

        if (!tableData || !tableData.rows) {
            container.textContent = '（无数据）';
            return container;
        }

        // 获取模板以获取列名
        const template = getTemplateByUid(tableData.templateUid);
        const columns = template ? template.columns : [];

        const table = document.createElement('table');
        table.className = 'wbap-td-csv-table';
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;margin:4px 0;';

        // 表头
        if (columns.length > 0) {
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            for (const col of columns) {
                const th = document.createElement('th');
                th.textContent = col;
                th.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:2px 6px;background:var(--SmartThemeBlurTintColor,#333);text-align:left;font-weight:bold;';
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);
        }

        // 数据行
        const tbody = document.createElement('tbody');
        const colCount = columns.length || (tableData.rows[0] ? tableData.rows[0].cells.length : 0);
        for (const row of tableData.rows) {
            const tr = document.createElement('tr');
            for (let i = 0; i < colCount; i++) {
                const td = document.createElement('td');
                td.textContent = (row.cells && row.cells[i] != null) ? row.cells[i] : '';
                td.style.cssText = 'border:1px solid var(--SmartThemeBorderColor,#555);padding:2px 6px;';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);

        return container;
    }

    /**
     * 渲染表格区域（折叠/展开 + tab 切换）
     * @param {number} messageId - 消息 ID
     * @returns {HTMLElement|null} 表格区域容器，无表格时返回 null
     */
    function renderTableArea(messageId) {
        if (!isEnabled()) return null;
        const tables = getTables();
        if (!tables || tables.length === 0) {
            return null;
        }

        // 外层容器
        const area = document.createElement('div');
        area.className = 'wbap-td-area';
        area.setAttribute('data-mesid', messageId);
        area.style.cssText = 'margin-top:6px;border:1px solid var(--SmartThemeBorderColor,#555);border-radius:4px;overflow:hidden;font-size:12px;';

        // 折叠/展开 header
        const header = document.createElement('div');
        header.className = 'wbap-td-header';
        header.style.cssText = 'display:flex;align-items:center;padding:4px 8px;cursor:pointer;background:var(--SmartThemeBlurTintColor,#333);user-select:none;';
        header.innerHTML = '<i class="fa-solid fa-table" style="margin-right:6px;"></i><span>表格数据</span><i class="fa-solid fa-chevron-right wbap-td-chevron" style="margin-left:auto;transition:transform 0.2s;"></i>';

        // 内容区（默认折叠）
        const body = document.createElement('div');
        body.className = 'wbap-td-body';
        body.style.cssText = 'display:none;';

        // 折叠/展开切换
        header.addEventListener('click', () => {
            const isCollapsed = body.style.display === 'none';
            body.style.display = isCollapsed ? 'block' : 'none';
            const chevron = header.querySelector('.wbap-td-chevron');
            if (chevron) {
                chevron.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
            }
        });

        // Tab 栏
        const tabBar = document.createElement('div');
        tabBar.className = 'wbap-td-tabs';
        tabBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid var(--SmartThemeBorderColor,#555);';

        // 内容面板容器
        const panelContainer = document.createElement('div');
        panelContainer.className = 'wbap-td-panels';

        // 为每个表格创建 tab 和面板
        tables.forEach((tableData, index) => {
            // Tab 按钮
            const tab = document.createElement('div');
            tab.className = 'wbap-td-tab';
            tab.textContent = tableData.name || `表格${index + 1}`;
            tab.setAttribute('data-table-uid', tableData.uid);
            tab.style.cssText = 'padding:3px 10px;cursor:pointer;border-right:1px solid var(--SmartThemeBorderColor,#555);opacity:0.6;transition:opacity 0.2s;';

            // 面板
            const panel = document.createElement('div');
            panel.className = 'wbap-td-panel';
            panel.setAttribute('data-table-uid', tableData.uid);
            panel.style.cssText = 'display:none;padding:4px;';
            panel.appendChild(renderTableContent(tableData));

            // Tab 点击切换
            tab.addEventListener('click', () => {
                // 隐藏所有面板，取消所有 tab 激活
                panelContainer.querySelectorAll('.wbap-td-panel').forEach(p => p.style.display = 'none');
                tabBar.querySelectorAll('.wbap-td-tab').forEach(t => {
                    t.style.opacity = '0.6';
                    t.style.borderBottom = 'none';
                });

                // 激活当前
                panel.style.display = 'block';
                tab.style.opacity = '1';
                tab.style.borderBottom = '2px solid var(--SmartThemeBodyColor,#fff)';
            });

            tabBar.appendChild(tab);
            panelContainer.appendChild(panel);
        });

        // 默认激活第一个 tab
        const firstTab = tabBar.querySelector('.wbap-td-tab');
        const firstPanel = panelContainer.querySelector('.wbap-td-panel');
        if (firstTab && firstPanel) {
            firstTab.style.opacity = '1';
            firstTab.style.borderBottom = '2px solid var(--SmartThemeBodyColor,#fff)';
            firstPanel.style.display = 'block';
        }

        body.appendChild(tabBar);
        body.appendChild(panelContainer);
        area.appendChild(header);
        area.appendChild(body);

        return area;
    }

    /**
     * 在最新 AI 消息底部注入表格区域
     * 监听 CHARACTER_MESSAGE_RENDERED 事件的回调
     * 
     * 逻辑：只在聊天中最后一条消息（即 AI 回复完成后的最新楼）底部渲染表格。
     * AI 流式生成期间该消息尚未成为最新楼，只有 RENDERED 事件触发时才表示回复完成。
     * 每次渲染新的最新楼时，移除旧楼的表格区域，保证始终只有一个。
     * 
     * @param {number} messageId - 消息 ID
     */
    function renderTableInMessage(messageId) {
        // 检查模块是否启用
        if (!isEnabled()) return;

        // 检查是否启用消息底部渲染
        const charConfig = getCharacterTableDisplayConfig();
        if (!charConfig.renderInMessage) return;

        // 只在最新楼渲染：检查该消息是否是聊天中的最后一条
        try {
            const context = SillyTavern.getContext();
            const chat = context.chat;
            if (chat && chat.length > 0) {
                const lastIndex = chat.length - 1;
                if (Number(messageId) !== lastIndex) {
                    return; // 不是最新楼，跳过
                }
            }
        } catch (e) {
            // SillyTavern 上下文不可用时，回退到 DOM 判断
            Logger.warn(TAG, '无法获取聊天上下文，尝试 DOM 回退判断');
        }

        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) return;

        // 跳过用户消息
        if (messageElement.classList.contains('mes_user')) return;

        // 移除之前所有楼层的表格区域（保证只有最新楼有）
        const oldAreas = document.querySelectorAll('#chat .wbap-td-area');
        oldAreas.forEach(area => area.remove());

        const area = renderTableArea(messageId);
        if (!area) return;

        // 注入到消息文本区域底部
        const mesText = messageElement.querySelector('.mes_text');
        if (mesText) {
            mesText.appendChild(area);
        }
    }

    /**
     * 在插件主面板中渲染表格总览
     * 样式参照 st-memory-enhancement：#序号 表格名 + 带行号的数据表格
     * 数据行深绿色背景，表头深灰色，所有表格纵向排列
     */
    function renderTableOverview() {
        const container = document.getElementById('wbap-table-overview');
        if (!container) return;

        if (!isEnabled()) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">表格模块未启用</p>';
            return;
        }

        const tables = getTables();
        if (!tables || tables.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">暂无表格数据，请先导入预设</p>';
            return;
        }

        container.innerHTML = '';

        tables.forEach((tableData, index) => {
            const template = getTemplateByUid(tableData.templateUid);
            const columns = template ? template.columns : [];

            // 标题: #0 时空表格
            const title = document.createElement('div');
            title.style.cssText = 'font-size:15px;font-weight:bold;margin:12px 0 6px 0;color:var(--SmartThemeBodyColor,#eee);';
            if (index === 0) title.style.marginTop = '4px';
            title.textContent = `#${index} ${tableData.name}`;
            container.appendChild(title);

            // 表格
            const table = document.createElement('table');
            table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px;';

            // 表头
            if (columns.length > 0) {
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                // 行号列
                const thIdx = document.createElement('th');
                thIdx.style.cssText = 'border:1px solid #555;padding:4px 8px;background:#2a2a2a;text-align:center;font-weight:bold;color:#ccc;width:30px;';
                headerRow.appendChild(thIdx);
                for (const col of columns) {
                    const th = document.createElement('th');
                    th.textContent = col;
                    th.style.cssText = 'border:1px solid #555;padding:4px 8px;background:#2a2a2a;text-align:center;font-weight:bold;color:#ccc;';
                    headerRow.appendChild(th);
                }
                thead.appendChild(headerRow);
                table.appendChild(thead);
            }

            // 数据行
            const tbody = document.createElement('tbody');
            const colCount = columns.length || 1;

            if (!tableData.rows || tableData.rows.length === 0) {
                const tr = document.createElement('tr');
                const tdIdx = document.createElement('td');
                tdIdx.style.cssText = 'border:1px solid #555;padding:4px 8px;text-align:center;color:#888;';
                tr.appendChild(tdIdx);
                const td = document.createElement('td');
                td.colSpan = colCount;
                td.textContent = '(空表)';
                td.style.cssText = 'border:1px solid #555;padding:4px 8px;text-align:center;color:#888;';
                tr.appendChild(td);
                tbody.appendChild(tr);
            } else {
                tableData.rows.forEach((row, rowIdx) => {
                    const tr = document.createElement('tr');
                    // 行号
                    const tdIdx = document.createElement('td');
                    tdIdx.textContent = rowIdx;
                    tdIdx.style.cssText = 'border:1px solid #555;padding:4px 8px;background:#1a3a1a;text-align:center;color:#8c8;font-weight:bold;';
                    tr.appendChild(tdIdx);
                    for (let i = 0; i < colCount; i++) {
                        const td = document.createElement('td');
                        td.textContent = (row.cells && row.cells[i] != null) ? row.cells[i] : '';
                        td.style.cssText = 'border:1px solid #555;padding:4px 8px;background:#1a3a1a;color:#ddd;';
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                });
            }

            table.appendChild(tbody);

            // 横向滚动包裹
            const scrollWrap = document.createElement('div');
            scrollWrap.style.cssText = 'overflow-x:auto;';
            scrollWrap.appendChild(table);
            container.appendChild(scrollWrap);
        });
    }

    /**
     * 注册消息渲染事件监听
     */
    function registerMessageRenderListener() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (context.eventSource && context.event_types) {
                    // 消息接收时：提取编辑指令、执行填表、替换正文（渲染前）
                    if (context.event_types.MESSAGE_RECEIVED) {
                        context.eventSource.on(context.event_types.MESSAGE_RECEIVED, handleMessageReceived);
                        Logger.log(TAG, '已注册 MESSAGE_RECEIVED 事件监听（自动填表）');
                    }

                    // 消息编辑时：重新解析编辑指令
                    if (context.event_types.MESSAGE_EDITED) {
                        context.eventSource.on(context.event_types.MESSAGE_EDITED, handleMessageEdited);
                        Logger.log(TAG, '已注册 MESSAGE_EDITED 事件监听');
                    }

                    // 滑动切换时：重新解析编辑指令
                    if (context.event_types.MESSAGE_SWIPED) {
                        context.eventSource.on(context.event_types.MESSAGE_SWIPED, handleMessageSwiped);
                        Logger.log(TAG, '已注册 MESSAGE_SWIPED 事件监听');
                    }

                    // 消息渲染后：在底部注入表格展示区域
                    if (context.event_types.CHARACTER_MESSAGE_RENDERED) {
                        context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, renderTableInMessage);
                        Logger.log(TAG, '已注册 CHARACTER_MESSAGE_RENDERED 事件监听');
                    }

                    // 对话提示词就绪时：注入表格数据供 AI 参考
                    if (context.event_types.CHAT_COMPLETION_PROMPT_READY) {
                        context.eventSource.on(context.event_types.CHAT_COMPLETION_PROMPT_READY, injectTableDataToPrompt);
                        Logger.log(TAG, '已注册 CHAT_COMPLETION_PROMPT_READY 事件监听（表格数据注入）');
                    }
                } else {
                    Logger.warn(TAG, 'SillyTavern 事件系统不可用，无法监听消息事件');
                }
            } else {
                Logger.warn(TAG, 'SillyTavern 上下文不可用，无法监听消息事件');
            }
        } catch (e) {
            Logger.error(TAG, '注册消息事件监听失败', e);
        }
    }

    // ==================== 公开 API ====================

    /**
     * 初始化模块
     */
    function init() {
        if (state.initialized) {
            Logger.log(TAG, '模块已初始化，跳过');
            return;
        }

        Logger.log(TAG, '初始化表格展示模块...');

        // 确保配置结构完整
        ensureTableDisplayConfig();

        // 加载默认预设（首次使用时）
        loadDefaultPresets().then(loaded => {
            if (loaded) {
                Logger.log(TAG, '默认预设已加载');
            }
            // 预设加载完成后渲染表格总览
            renderTableOverview();
        }).catch(e => {
            Logger.warn(TAG, '加载默认预设时出错（非致命）', e);
        });

        // 注册消息渲染事件监听
        registerMessageRenderListener();

        // 初始渲染表格总览
        renderTableOverview();

        state.initialized = true;
        Logger.log(TAG, '表格展示模块初始化完成');
    }

    /**
     * 打开设置面板
     */
    function openSettings() {
        Logger.log(TAG, '打开设置面板');
        const modal = ensureSettingsModal();
        if (modal) {
            loadSettingsToPanel(modal);
            modal.classList.add('open');
        } else {
            Logger.error(TAG, '无法打开设置面板：模态框创建失败');
        }
    }

    /**
     * 获取合并后的配置（全局 + 角色）
     * @returns {Object} 合并后的配置
     */
    function getConfig() {
        const configs = ensureTableDisplayConfig();
        return {
            global: configs.global,
            character: configs.character,
            // 便捷访问
            enabled: configs.character.enabled,
            templates: configs.global.templates,
            tables: configs.global.tables,
            extractTag: configs.character.extractTag,
            editTag: configs.character.editTag,
            renderInMessage: configs.character.renderInMessage,
            apiConfig: configs.global.apiConfig
        };
    }

    /**
     * 获取所有模板
     * @returns {Array} 模板数组
     */
    function getTemplates() {
        const globalConfig = getGlobalTableDisplayConfig();
        return globalConfig.templates || [];
    }

    /**
     * 获取当前角色的所有表格
     * @returns {Array} 表格数组
     */
    function getTables() {
        const globalConfig = getGlobalTableDisplayConfig();
        return globalConfig.tables || [];
    }

    /**
     * 设置模块启用状态
     * @param {boolean} enabled - 是否启用
     */
    /**
     * 设置模块启用状态
     * 禁用时停止数据提取和渲染，但保留已有数据
     * @param {boolean} enabled - 是否启用
     */
    function setEnabled(enabled) {
        const charConfig = getCharacterTableDisplayConfig();
        charConfig.enabled = !!enabled;
        saveConfig();

        if (!enabled) {
            // 禁用时：移除已渲染的表格区域（不删除数据）
            try {
                const areas = document.querySelectorAll('.wbap-td-area');
                areas.forEach(area => area.remove());
            } catch (e) {
                Logger.warn(TAG, '清理已渲染表格区域时出错', e);
            }
        }

        Logger.log(TAG, `模块${enabled ? '已启用' : '已禁用'}`);
    }

    /**
     * 检查模块是否启用
     * @returns {boolean} 是否启用
     */
    function isEnabled() {
        const charConfig = getCharacterTableDisplayConfig();
        return charConfig.enabled === true;
    }

    // ==================== 模块导出 ====================

    WBAP.TableDisplay = {
        // 初始化
        init,
        openSettings,
        
        // 配置管理
        getConfig,
        getGlobalTableDisplayConfig,
        getCharacterTableDisplayConfig,
        ensureTableDisplayConfig,
        saveConfig,
        setEnabled,
        isEnabled,
        
        // 模板管理
        generateTemplateUid,
        validateTemplate,
        isAmily2PresetFormat,
        convertAmily2TableToTemplate,
        importAmily2Preset,
        importTemplate,
        exportTemplate,
        deleteTemplate,
        getTemplates,
        getTemplateByUid,
        
        // 表格管理
        generateTableUid,
        generateRowUid,
        createTable,
        deleteTable,
        getTable,
        getTables,
        
        // 行操作
        insertRow,
        updateRow,
        deleteRow,
        updateCell,
        
        // 编辑指令解析器
        extractTableEditTag,
        extractContentTag,
        formatParams,
        parseLooseDict,
        handleCellValue,
        classifyParams,
        parseEditInstructions,
        sortInstructions,
        executeInstructions,
        executeInsert,
        executeUpdate,
        executeDelete,
        processMessageForTableEdits,
        handleMessageReceived,
        handleMessageEdited,
        handleMessageSwiped,
        
        // 消息渲染器
        renderTableContent,
        renderTableArea,
        renderTableInMessage,
        renderTableOverview,
        registerMessageRenderListener,
        
        // 填表引擎
        getTableDataText,
        getRecentChatHistory,
        getWorldBookContent,
        assemblePromptMessages,
        batchFillTables,
        injectTableDataToPrompt,
        
        // 设置面板 UI
        ensureSettingsModal,
        loadSettingsToPanel,
        refreshTableList,
        renderTableEditor,
        escapeHtml,
        
        // 默认预设加载
        loadDefaultPresets,
        
        // 默认配置工厂（供外部使用）
        createDefaultGlobalTableDisplayConfig,
        createDefaultCharacterTableDisplayConfig,
        
        // 状态访问（只读）
        get initialized() {
            return state.initialized;
        }
    };

    Logger.log(TAG, '模块已加载');

})();
