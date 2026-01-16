// ui_templates.js

(function () {
    'use strict';

    // 确保全局命名空间存在
    window.WBAP = window.WBAP || {};

    const PANEL_HTML = `
<div id="wbap-panel" class="wbap-panel">
    <div class="wbap-panel-container">
        <div class="wbap-panel-header">
            <h3>笔者之脑</h3>
            <div class="wbap-panel-actions">
                <button id="wbap-settings-btn" class="wbap-btn wbap-btn-icon" title="设置">
                    <i class="fa-solid fa-cog"></i>
                </button>
                <button id="wbap-close-btn" class="wbap-btn wbap-btn-icon" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        </div>
        <div class="wbap-panel-content">
        
            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">提示词预设</span>
                </div>
                <div class="wbap-form-group">
                    <select id="wbap-prompt-preset-select" class="wbap-preset-select"></select>
                </div>
                <div id="wbap-prompt-description-area" class="wbap-prompt-description"></div>
                <div id="wbap-prompt-binding-summary" class="wbap-text-muted" style="font-size: 12px; margin-top: 6px;"></div>
                <div id="wbap-prompt-bound-apis" class="wbap-tag-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
                <div class="wbap-prompt-actions-toolbar">
                    <button id="wbap-prompt-new-btn" class="wbap-btn wbap-btn-xs" title="新建"><i class="fa-solid fa-plus"></i> 新建</button>
                    <button id="wbap-import-prompt-btn" class="wbap-btn wbap-btn-xs" title="导入"><i class="fa-solid fa-download"></i> 导入</button>
                    <button id="wbap-open-prompt-picker" class="wbap-btn wbap-btn-xs" title="快速选择"><i class="fa-solid fa-list-check"></i> 选择</button>
                    <button id="wbap-prompt-edit-btn" class="wbap-btn wbap-btn-xs" title="编辑"><i class="fa-solid fa-pencil"></i> 编辑</button>
                    <button id="wbap-prompt-export-btn" class="wbap-btn wbap-btn-xs" title="导出"><i class="fa-solid fa-upload"></i> 导出</button>
                    <button id="wbap-prompt-delete-btn" class="wbap-btn wbap-btn-xs wbap-btn-danger" title="删除"><i class="fa-solid fa-trash"></i> 删除</button>
                    <button id="wbap-prompt-bind-apis-btn" class="wbap-btn wbap-btn-xs" title="绑定 API"><i class="fa-solid fa-link"></i> 选择 API</button>
                </div>
                <input type="file" id="wbap-prompt-file-input" accept=".json" class="wbap-hidden">
                
                <div id="wbap-prompt-variables-container" class="wbap-variables-container"></div>
                <button id="wbap-save-variables-btn" class="wbap-btn wbap-btn-primary" style="width: 100%; margin-top: 10px;">应用变量</button>
                <div id="wbap-prompt-binding-list" style="display: none; border: 1px solid var(--wbap-border, #444); padding: 8px; border-radius: 6px; margin-top: 8px; max-height: 160px; overflow-y: auto;"></div>
            </div>
            <div class="wbap-section">
                <div class="wbap-section-header" style="align-items: center; gap: 8px;">
                    <span class="wbap-section-title">副提示词预设</span>
                    <label style="font-size: 12px; color: var(--wbap-text-muted); display: inline-flex; gap: 6px; align-items: center;">
                        <input type="checkbox" id="wbap-secondary-enabled">
                        启用
                    </label>
                </div>
                <div class="wbap-form-group">
                    <select id="wbap-secondary-preset-select" class="wbap-preset-select"></select>
                </div>
                <div id="wbap-secondary-description-area" class="wbap-prompt-description"></div>
                <div class="wbap-prompt-actions-toolbar">
                    <button id="wbap-secondary-bind-btn" class="wbap-btn wbap-btn-xs" title="绑定 API"><i class="fa-solid fa-link"></i> 绑定 API</button>
                </div>
                <div id="wbap-secondary-binding-summary" class="wbap-text-muted" style="font-size: 12px; margin-top: 6px;"></div>
                <div id="wbap-secondary-binding-list" style="display: none; border: 1px solid var(--wbap-border, #444); padding: 8px; border-radius: 6px; margin-top: 8px; max-height: 160px; overflow-y: auto;"></div>
            </div>
            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">处理状态</span>
                </div>
                <div id="wbap-status-panel" class="wbap-status-panel">
                    <div class="wbap-status-header">
                        <div class="wbap-status-item">
                            <span id="wbap-status-indicator" class="wbap-status-indicator wbap-status-ready"></span>
                            <span id="wbap-status-text" class="wbap-status-text">就绪</span>
                        </div>
                    </div>
                    <div id="wbap-progress-list" class="wbap-progress-list wbap-hidden"></div>
                    <div style="margin-top: 12px; font-size: 12px; color: var(--wbap-text-muted);">
                        <div>上次处理: <span id="wbap-last-process">-</span></div>
                        <div>处理耗时: <span id="wbap-process-time">-</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`;

    const PROMPT_EDITOR_HTML = `
<div id="wbap-prompt-editor-modal" class="wbap-modal">
    <div class="wbap-modal-content" style="width: 900px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="wbap-modal-header">
            <h3>编辑提示词模板</h3>
            <button id="wbap-prompt-editor-close" class="wbap-btn wbap-btn-icon">&times;</button>
        </div>
        <div class="wbap-modal-body" style="overflow-y: auto; flex: 1;">
            <input type="hidden" id="wbap-prompt-edit-index">
            
            <!-- 基本信息 -->
            <div class="wbap-form-group">
                <label>模板名称 <span style="color: var(--wbap-danger);">*</span></label>
                <input type="text" id="wbap-prompt-edit-name" placeholder="例如：世界书分析助手">
            </div>

            <div class="wbap-form-group">
                <label>模板版本</label>
                <input type="text" id="wbap-prompt-edit-version" placeholder="例如：v1.2">
            </div>
            
            <div class="wbap-form-group">
                <label>模板描述</label>
                <textarea id="wbap-prompt-edit-description" rows="2" placeholder="这个模板用来做什么..."></textarea>
            </div>

            <!-- 占位符 -->
            <div class="wbap-form-group" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                <label style="margin-bottom: 8px; display: block; font-size: 13px; color: var(--wbap-text-muted);">可用占位符（点击插入）</label>
                <div id="wbap-placeholder-buttons" style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{worldbook_content}">{worldbook_content}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{user_input}">{user_input}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{context}">{context}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{previous_results}">{previous_results}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{sulv1}">{sulv1}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{sulv2}">{sulv2}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{sulv3}">{sulv3}</button>
                    <button type="button" class="wbap-placeholder-btn" data-placeholder="{sulv4}">{sulv4}</button>
                </div>
                <small style="color: var(--wbap-text-muted); margin-top: 8px; display: block;">
                    <strong>{worldbook_content}</strong> - 世界书内容 | 
                    <strong>{user_input}</strong> - 用户输入 | 
                    <strong>{context}</strong> - 对话上下文 | 
                    <strong>{previous_results}</strong> - 一次处理结果（供总局二次处理使用） |
                    <strong>{sulv1-4}</strong> - 自定义变量
                </small>
            </div>

            <!-- Final System Directive -->
            <div class="wbap-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label>前置系统指令 (Final System Directive)</label>
                    <span id="wbap-final-directive-char-count" style="font-size: 12px; color: var(--wbap-text-muted);">0 字符</span>
                </div>
                <textarea id="wbap-prompt-edit-final-directive" rows="5" placeholder="最终系统指令，会追加在 System Prompt 之前...&#10;&#10;可用占位符: {worldbook_content}, {context}, {user_input}, {previous_results}, {sulv1}, {sulv2}, {sulv3}, {sulv4}" style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px;"></textarea>
            </div>

            <!-- System Prompt -->
            <div class="wbap-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label>System Prompt</label>
                    <span id="wbap-system-char-count" style="font-size: 12px; color: var(--wbap-text-muted);">0 字符</span>
                </div>
                <textarea id="wbap-prompt-edit-system" rows="10" placeholder="系统提示词，定义 AI 的角色和行为...&#10;&#10;可用占位符: {worldbook_content}, {context}, {user_input}, {previous_results}, {sulv1}, {sulv2}, {sulv3}, {sulv4}" style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px;"></textarea>
            </div>

            <!-- Main Prompt -->
            <div class="wbap-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label>Main Prompt (User Prompt)</label>
                    <span id="wbap-main-char-count" style="font-size: 12px; color: var(--wbap-text-muted);">0 字符</span>
                </div>
                <textarea id="wbap-prompt-edit-main" rows="10" placeholder="用户提示词，包含具体的任务指令...&#10;&#10;可用占位符: {worldbook_content}, {user_input}, {context}, {previous_results}, {sulv1}, {sulv2}, {sulv3}, {sulv4}" style="font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 13px;"></textarea>
            </div>

            <!-- 变量编辑区 -->
            <div class="wbap-form-group" style="border-top: 1px solid var(--wbap-border, #444); padding-top: 16px; margin-top: 16px;">
                <label style="margin-bottom: 8px;">自定义变量（可选）</label>
                <div id="wbap-prompt-editor-variables" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                    <div>
                        <label for="wbap-edit-var-sulv1" style="font-size: 12px; color: var(--wbap-text-muted);">sulv1</label>
                        <input type="text" id="wbap-edit-var-sulv1" placeholder="变量 sulv1 的默认值" style="width: 100%;">
                    </div>
                    <div>
                        <label for="wbap-edit-var-sulv2" style="font-size: 12px; color: var(--wbap-text-muted);">sulv2</label>
                        <input type="text" id="wbap-edit-var-sulv2" placeholder="变量 sulv2 的默认值" style="width: 100%;">
                    </div>
                    <div>
                        <label for="wbap-edit-var-sulv3" style="font-size: 12px; color: var(--wbap-text-muted);">sulv3</label>
                        <input type="text" id="wbap-edit-var-sulv3" placeholder="变量 sulv3 的默认值" style="width: 100%;">
                    </div>
                    <div>
                        <label for="wbap-edit-var-sulv4" style="font-size: 12px; color: var(--wbap-text-muted);">sulv4</label>
                        <input type="text" id="wbap-edit-var-sulv4" placeholder="变量 sulv4 的默认值" style="width: 100%;">
                    </div>
                </div>
                <small style="color: var(--wbap-text-muted); margin-top: 8px; display: block;">
                    这些是变量的默认值，用户可以在主面板修改它们。
                </small>
            </div>

            <!-- 预览区域 -->
            <div class="wbap-form-group" style="border-top: 1px solid var(--wbap-border, #444); padding-top: 16px; margin-top: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label>预览</label>
                    <button type="button" id="wbap-prompt-preview-btn" class="wbap-btn wbap-btn-secondary wbap-btn-xs">
                        <i class="fa-solid fa-eye"></i> 刷新预览
                    </button>
                </div>
                <div id="wbap-prompt-preview" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto; font-family: 'Consolas', 'Monaco', 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; color: var(--wbap-text-muted);">
                    点击“刷新预览”查看生成的提示词...
                </div>
            </div>
        </div>
        <div class="wbap-modal-footer" style="border-top: 1px solid var(--wbap-border, #444); padding-top: 12px;">
            <button id="wbap-prompt-editor-cancel" class="wbap-btn wbap-btn-secondary">取消</button>
            <button id="wbap-prompt-editor-save" class="wbap-btn wbap-btn-primary">保存</button>
        </div>
    </div>
</div>
`;

    const SETTINGS_HTML = `
<div id="wbap-settings" class="wbap-settings">
    <div class="wbap-settings-container">
        <div class="wbap-settings-header">
            <h3>设置</h3>
            <button id="wbap-settings-close" class="wbap-btn wbap-btn-icon">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-settings-content">

            <div class="wbap-section">
                 <h4 style="margin: 0 0 12px 0; color: var(--wbap-text);">通用设置</h4>
                 <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-enabled" checked>
                        启用插件
                    </label>
                </div>
                <div class="wbap-form-group">
                    <label>全局最大并发（0 = 不限制）</label>
                    <input type="number" id="wbap-global-max-concurrent" min="0" max="10" value="0" style="width: 140px;">
                </div>
                <div class="wbap-form-group">
                    <label>全局请求超时（秒，0 = 使用端点设置）</label>
                    <input type="number" id="wbap-global-timeout" min="0" max="300" value="0" style="width: 140px;">
                </div>
            </div>

            <!-- API 实例管理容器 -->
                    <div id="wbap-selective-mode-container">
                        <div class="wbap-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <h4 style="margin: 0; color: var(--wbap-text);">API 实例管理</h4>
                                <button id="wbap-add-api-btn" class="wbap-btn wbap-btn-secondary wbap-btn-xs">
                                    <i class="fa-solid fa-plus"></i> 新增 API 实例
                                </button>
                            </div>
                            <div id="wbap-api-endpoint-list" class="wbap-api-endpoint-list">
                                <!-- API 实例会在这里动态生成 -->
                            </div>
                        </div>
                    </div>

            <div class="wbap-section">
                <h4 style="margin: 0 0 12px 0; color: var(--wbap-text);">总局 API（二次处理）</h4>
                <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-agg-enabled">
                        启用总局二次处理
                    </label>
                </div>
                <div class="wbap-form-group">
                    <label>选择 API 实例</label>
                    <select id="wbap-agg-endpoint"></select>
                </div>
                <div class="wbap-form-group">
                    <label>选择提示词</label>
                    <select id="wbap-agg-prompt"></select>
                    <small class="wbap-text-muted">用于二次处理的专属提示词，支持 {previous_results}、{user_input}、{context}。</small>
                </div>
            </div>

            <div class="wbap-section">
                <h4 style="margin: 0 0 12px 0; color: var(--wbap-text);">高级设置</h4>
                <div class="wbap-form-group">
                    <label>上下文轮次</label>
                    <div class="wbap-slider-row">
                        <input type="range" id="wbap-context-rounds" min="0" max="10" value="5" step="1">
                        <span id="wbap-context-rounds-value">5</span>
                    </div>
                    <small class="wbap-text-muted">每级包含 1 条用户消息 + 1 条回复，0 = 不读取上下文。</small>
                </div>
                <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-enable-chunking">
                        启用段落拆分（默认关闭）
                    </label>
                    <small class="wbap-text-muted">勾选后会将长文本按段落拆分后并发请求 API。</small>
                </div>
                <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-skip-processed">
                        检测到其他插件标记时直接放行
                    </label>
                    <small class="wbap-text-muted">勾选后，如果输入中已包含其他插件的注入标记，将不再二次处理以避免重复。</small>
                </div>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-settings-progress-panel">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">显示处理进度面板</span>
                </label>
            </div>

            <!-- 剧情优化区域 (默认展开) -->
            <div class="wbap-section" id="wbap-optimization-section">
                <div class="wbap-section-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <label class="wbap-switch-label" style="margin: 0;">
                        <input type="checkbox" id="wbap-settings-plot-optimization">
                        <span class="wbap-switch-slider"></span>
                        <span class="wbap-switch-text" style="font-weight: 600;">启用剧情优化</span>
                    </label>
                </div>
                
                <div id="wbap-optimization-content">
                    <div class="wbap-form-group">
                        <label class="wbap-switch-label">
                            <input type="checkbox" id="wbap-settings-plot-optimization-fab">
                            <span class="wbap-switch-slider"></span>
                            <span class="wbap-switch-text">启用剧情优化悬浮球（全局快捷入口）</span>
                        </label>
                    </div>
                    <div class="wbap-form-group">
                        <label class="wbap-switch-label">
                            <input type="checkbox" id="wbap-settings-level3-enabled">
                            <span class="wbap-switch-slider"></span>
                            <span class="wbap-switch-text">启用三级优化（处理后自动弹出优化面板）</span>
                        </label>
                    </div>
                    
                    <!-- 剧情优化提示词预设 -->
                    <div class="wbap-form-group" style="margin-top: 16px;">
                        <label>剧情优化提示词预设</label>
                        <select id="wbap-opt-prompt-select" class="wbap-preset-select"></select>
                    </div>
                    <div id="wbap-opt-prompt-desc" class="wbap-prompt-description"></div>
                    <div class="wbap-prompt-actions-toolbar" style="margin-top: 6px;">
                        <button id="wbap-opt-prompt-new-btn" class="wbap-btn wbap-btn-xs" title="新建"><i class="fa-solid fa-plus"></i> 新建</button>
                        <button id="wbap-opt-prompt-import-btn" class="wbap-btn wbap-btn-xs" title="导入"><i class="fa-solid fa-download"></i> 导入</button>
                        <button id="wbap-opt-prompt-edit-btn" class="wbap-btn wbap-btn-xs" title="编辑"><i class="fa-solid fa-pencil"></i> 编辑</button>
                        <button id="wbap-opt-prompt-export-btn" class="wbap-btn wbap-btn-xs" title="导出"><i class="fa-solid fa-upload"></i> 导出</button>
                        <button id="wbap-opt-prompt-delete-btn" class="wbap-btn wbap-btn-xs wbap-btn-danger" title="删除"><i class="fa-solid fa-trash"></i> 删除</button>
                    </div>
                    <input type="file" id="wbap-opt-prompt-file-input" accept=".json" class="wbap-hidden">
                    
                    <!-- API配置 -->
                    <div class="wbap-form-group" style="margin-top: 16px;">
                        <label class="wbap-switch-label">
                            <input type="checkbox" id="wbap-optimization-use-independent">
                            <span class="wbap-switch-slider"></span>
                            <span class="wbap-switch-text">使用独立 API 配置</span>
                        </label>
                    </div>
                    <div class="wbap-form-group" id="wbap-optimization-endpoint-block">
                        <label>优化面板默认 API 实例</label>
                        <select id="wbap-optimization-endpoint-select"></select>
                    </div>
                    <div id="wbap-optimization-independent-block" class="wbap-hidden">
                        <div class="wbap-form-group">
                            <label>优化面板 API URL</label>
                            <input type="text" id="wbap-optimization-api-url" placeholder="https://api.example.com/v1">
                        </div>
                        <div class="wbap-form-group">
                            <label>优化面板 API Key</label>
                            <input type="password" id="wbap-optimization-api-key" placeholder="sk-...">
                        </div>
                        <div class="wbap-form-group">
                            <label>优化面板模型</label>
                            <div class="wbap-input-group">
                                <select id="wbap-optimization-model"></select>
                                <button id="wbap-optimization-fetch-models" class="wbap-btn wbap-btn-secondary">获取模型</button>
                            </div>
                        </div>
                        <div class="wbap-form-row">
                            <div class="wbap-form-group">
                                <label>Max Tokens</label>
                                <input type="number" id="wbap-optimization-max-tokens" min="0" value="4000">
                            </div>
                            <div class="wbap-form-group">
                                <label>Temperature</label>
                                <input type="number" id="wbap-optimization-temperature" min="0" max="2" step="0.1" value="0.7">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="wbap-section">
                <h4 style="margin: 0 0 12px 0; color: var(--wbap-text);">配置管理</h4>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button id="wbap-export-config" class="wbap-btn wbap-btn-secondary">
                        <i class="fa-solid fa-upload"></i> 导出配置
                    </button>
                    <button id="wbap-import-config" class="wbap-btn wbap-btn-secondary">
                        <i class="fa-solid fa-download"></i> 导入配置
                    </button>
                    <input type="file" id="wbap-config-file-input" accept=".json" class="wbap-hidden">
                    <button id="wbap-reset-config" class="wbap-btn wbap-btn-danger">
                        <i class="fa-solid fa-trash"></i> 重置配置
                    </button>
                </div>
            </div>
        </div>
        <div class="wbap-settings-footer">
            <button id="wbap-save-settings" class="wbap-btn wbap-btn-primary" style="width: 100%;">
                <i class="fa-solid fa-check"></i> 保存设置
            </button>
        </div>
    </div>
</div>`;

    const API_ENDPOINT_EDITOR_HTML = `
<div id="wbap-endpoint-editor-modal" class="wbap-modal">
    <div class="wbap-modal-content" style="width: 800px; max-width: 95vw;">
        <div class="wbap-modal-header">
            <h3 id="wbap-endpoint-editor-title">编辑 API 实例</h3>
            <button id="wbap-endpoint-editor-close" class="wbap-btn wbap-btn-icon">&times;</button>
        </div>
        <div class="wbap-modal-body" style="display: flex; gap: 16px;">
            <!-- 左侧：API 配置 -->
            <div style="flex: 1;">
                <input type="hidden" id="wbap-endpoint-edit-id">
                <div class="wbap-form-group">
                    <label>实例名称</label>
                    <input type="text" id="wbap-endpoint-edit-name" placeholder="例如：DeepSeek 专用">
                </div>
                <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-endpoint-edit-enabled" checked>
                        启用此实例
                    </label>
                </div>
                <div class="wbap-form-group">
                    <label>
                        <input type="checkbox" id="wbap-endpoint-edit-dedupe" checked>
                        启用并发去重（相同请求合并）
                    </label>
                </div>
                <div class="wbap-form-group">
                    <label>API URL</label>
                    <input type="text" id="wbap-endpoint-edit-url" placeholder="https://api.deepseek.com/v1">
                </div>
                <div class="wbap-form-group">
                    <label>API Key</label>
                    <input type="password" id="wbap-endpoint-edit-key" placeholder="sk-...">
                </div>
                <div class="wbap-form-group">
                    <label>模型名称</label>
                    <div class="wbap-input-group">
                        <select id="wbap-endpoint-edit-model"></select>
                        <button id="wbap-endpoint-fetch-models-btn" class="wbap-btn wbap-btn-secondary">获取模型</button>
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>Max Tokens</label>
                        <input type="number" id="wbap-endpoint-edit-max-tokens" value="2000">
                    </div>
                    <div class="wbap-form-group">
                        <label>Temperature</label>
                        <div class="wbap-slider-row">
                            <input type="range" id="wbap-endpoint-edit-temperature" min="0" max="2" step="0.1" value="0.7">
                            <span id="wbap-endpoint-edit-temperature-value">0.7</span>
                        </div>
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>Top P</label>
                        <input type="number" id="wbap-endpoint-edit-top-p" min="0" max="1" step="0.01" value="1">
                    </div>
                    <div class="wbap-form-group">
                        <label>Presence Penalty</label>
                        <input type="number" id="wbap-endpoint-edit-presence-penalty" min="-2" max="2" step="0.1" value="0">
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>Frequency Penalty</label>
                        <input type="number" id="wbap-endpoint-edit-frequency-penalty" min="-2" max="2" step="0.1" value="0">
                    </div>
                    <div class="wbap-form-group">
                        <label>最大重试次数</label>
                        <input type="number" id="wbap-endpoint-edit-max-retries" min="0" max="5" value="1">
                    </div>
                </div>
                <div class="wbap-form-group">
                    <label>重试基础延迟（毫秒）</label>
                    <input type="number" id="wbap-endpoint-edit-retry-delay" min="0" value="800">
                    <small style="color: var(--wbap-text-muted);">发生 429/5xx/网络错误时按重试次数指数退避。</small>
                </div>
                <div class="wbap-form-group">
                    <label>请求超时（秒，0 = 使用全局或默认）</label>
                    <input type="number" id="wbap-endpoint-edit-timeout" min="0" value="60" placeholder="0">
                    <small style="color: var(--wbap-text-muted);">优先级：全局超时 &gt; 端点超时；全局=0 时使用端点值，端点=0 时回退默认。</small>
                </div>
                 <div class="wbap-form-group">
                    <button id="wbap-endpoint-test-btn" class="wbap-btn wbap-btn-secondary">测试连接</button>
                    <small id="wbap-endpoint-test-result" style="margin-left: 8px;"></small>
                </div>
            </div>
            <!-- 右侧：世界书与条目选择 -->
            <div style="flex: 1; display: flex; flex-direction: column;">
                <div class="wbap-form-group">
                    <label>选择世界书（可多选）</label>
                    <div class="wbap-input-group" style="gap: 8px; flex-wrap: wrap;">
                        <select id="wbap-endpoint-edit-worldbook-select"></select>
                        <button id="wbap-endpoint-add-worldbook" class="wbap-btn wbap-btn-secondary wbap-btn-xs">添加</button>
                    </div>
                    <div id="wbap-endpoint-selected-worldbooks" class="wbap-tag-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
                </div>

                <div class="wbap-form-group" style="flex: 1; display: flex; gap: 12px; overflow: hidden;">
                    <!-- Left Column: World Book List -->
                    <div id="wbap-worldbook-list-column" style="width: 150px; border: 1px solid var(--wbap-border, #444); border-radius: 4px; overflow-y: auto; background: var(--wbap-bg-secondary);">
                        <div id="wbap-endpoint-book-list-container" class="wbap-book-list-container">
                            <!-- Book names will be injected here -->
                            <p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">请先添加世界书</p>
                        </div>
                    </div>

                    <!-- Right Column: Entry List -->
                    <div id="wbap-entry-list-column" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                            <label style="margin: 0;">选择条目</label>
                            <div style="display: flex; gap: 6px;">
                                <button id="wbap-endpoint-entries-select-all" class="wbap-btn wbap-btn-secondary wbap-btn-xs">全选</button>
                                <button id="wbap-endpoint-entries-clear" class="wbap-btn wbap-btn-secondary wbap-btn-xs">取消全选</button>
                            </div>
                        </div>
                        <div id="wbap-endpoint-edit-entry-list" style="overflow-y: auto; border: 1px solid var(--wbap-border, #444); padding: 8px; border-radius: 4px; flex: 1;">
                            <p class="wbap-text-muted" style="text-align: center; font-size: 12px;">请从左侧选择一本世界书</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="wbap-modal-footer">
            <button id="wbap-endpoint-editor-save" class="wbap-btn wbap-btn-primary">保存</button>
        </div>
    </div>
</div>
`;


    const PROMPT_PICKER_HTML = `
<div id="wbap-prompt-picker-modal" class="wbap-modal">
    <div class="wbap-modal-content" style="width: 480px; max-width: 95vw; max-height: 80vh; display: flex; flex-direction: column;">
        <div class="wbap-modal-header">
            <h3>选择提示词预设</h3>
            <button id="wbap-prompt-picker-close" class="wbap-btn wbap-btn-icon">&times;</button>
        </div>
        <div class="wbap-modal-body" style="overflow-y: auto; padding: 12px;">
            <div id="wbap-prompt-picker-list" class="wbap-prompt-picker-list"></div>
        </div>
        <div class="wbap-modal-footer" style="justify-content: flex-end;">
            <button id="wbap-prompt-picker-cancel" class="wbap-btn wbap-btn-secondary">取消</button>
            <button id="wbap-prompt-picker-apply" class="wbap-btn wbap-btn-primary">应用</button>
        </div>
    </div>
</div>
`;

    const PROGRESS_PANEL_HTML = `
<div id="wbap-progress-panel" class="wbap-progress-panel">
    <button id="wbap-progress-close" class="wbap-progress-close" title="关闭">&times;</button>
    <div class="wbap-progress-content">
        <h4 id="wbap-progress-title">正在思考...</h4>
        <div class="wbap-progress-bar-container">
            <div id="wbap-progress-bar" class="wbap-progress-bar"></div>
        </div>
        <div class="wbap-progress-info">
            <span id="wbap-progress-status">0%</span>
            <span id="wbap-progress-timer">00:00</span>
        </div>
    </div>
    <div class="wbap-resize-handle" id="wbap-progress-resize-handle"></div>
</div>
`;

    const OPTIMIZATION_PANEL_HTML = `
<div id="wbap-opt-panel" class="wbap-opt-panel-root wbap-hidden">
    <div class="wbap-opt-container">
        <div class="wbap-opt-header">
            <div class="wbap-opt-title-group">
                <div class="wbap-opt-title">剧情优化助手</div>
                <div class="wbap-opt-subtitle">Plot Optimization</div>
            </div>
            <div class="wbap-opt-actions">
                <button id="wbap-opt-preview-toggle" class="wbap-opt-icon-btn" title="预览优化稿">
                    <i class="fa-regular fa-clone"></i>
                </button>
                <button id="wbap-opt-close" class="wbap-opt-icon-btn" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="wbap-opt-body">
            <div id="wbap-opt-chat" class="wbap-opt-chat-stream"></div>
            <div id="wbap-opt-preview" class="wbap-opt-preview-overlay">
                <div class="wbap-opt-preview-header">
                    <span>预览优化稿</span>
                    <button id="wbap-opt-preview-close" class="wbap-opt-icon-btn" title="关闭预览">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="wbap-opt-preview-body">
                    <textarea id="wbap-opt-preview-text" class="wbap-opt-textarea" readonly></textarea>
                </div>
            </div>
        </div>
        <div class="wbap-opt-footer">
            <div class="wbap-opt-toolbar">
                <button class="wbap-opt-chip wbap-opt-chip-btn" id="wbap-opt-world-btn" type="button">
                    <i class="fa-solid fa-book-open"></i>
                    <span id="wbap-opt-world-label">世界书</span>
                </button>
                <div id="wbap-opt-world-pop" class="wbap-opt-popover wbap-hidden">
                    <div class="wbap-opt-pop-header">
                        <div>选择世界书与条目</div>
                        <div class="wbap-opt-pop-actions">
                            <button id="wbap-opt-world-refresh" class="wbap-opt-mini-btn" type="button">刷新</button>
                            <button id="wbap-opt-world-close" class="wbap-opt-icon-btn" type="button"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>
                    <div class="wbap-opt-pop-body">
                        <div class="wbap-opt-pop-col">
                            <div class="wbap-opt-pop-title">世界书</div>
                            <div id="wbap-opt-world-list" class="wbap-opt-list"></div>
                        </div>
                        <div class="wbap-opt-pop-col">
                            <div class="wbap-opt-pop-title">条目（可选）</div>
                            <div id="wbap-opt-entry-list" class="wbap-opt-list wbap-opt-list-entries">
                                <div class="wbap-opt-empty">请先选择世界书</div>
                            </div>
                        </div>
                    </div>
                    <div class="wbap-opt-pop-footer">
                        <button id="wbap-opt-world-clear" class="wbap-opt-mini-btn" type="button">清空</button>
                        <button id="wbap-opt-world-apply" class="wbap-opt-mini-btn wbap-opt-mini-primary" type="button">完成</button>
                    </div>
                </div>
                <!-- 选择提示词按钮 -->
                <button class="wbap-opt-chip wbap-opt-chip-btn" id="wbap-opt-prompt-btn" type="button">
                    <i class="fa-solid fa-file-lines"></i>
                    <span id="wbap-opt-prompt-label">提示词</span>
                </button>
                <div id="wbap-opt-prompt-pop" class="wbap-opt-popover wbap-opt-popover-sm wbap-hidden">
                    <div class="wbap-opt-pop-header">
                        <div>选择提示词预设</div>
                        <button id="wbap-opt-prompt-close" class="wbap-opt-icon-btn" type="button">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="wbap-opt-pop-body-single">
                        <div id="wbap-opt-prompt-list" class="wbap-opt-list"></div>
                    </div>
                </div>
                <!-- API 实例选择按钮 + 弹窗 -->
                <button class="wbap-opt-chip wbap-opt-chip-btn" id="wbap-opt-endpoint-btn" type="button">
                    <i class="fa-solid fa-server"></i>
                    <span id="wbap-opt-endpoint-label">API 实例</span>
                </button>
                <div id="wbap-opt-endpoint-pop" class="wbap-opt-popover wbap-opt-popover-sm wbap-hidden">
                    <div class="wbap-opt-pop-header">
                        <div>选择 API 实例</div>
                        <button id="wbap-opt-endpoint-close" class="wbap-opt-icon-btn" type="button">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="wbap-opt-pop-body-single">
                        <div id="wbap-opt-endpoint-list" class="wbap-opt-list"></div>
                    </div>
                </div>
                <!-- 模型选择按钮 + 弹窗 -->
                <button class="wbap-opt-chip wbap-opt-chip-btn" id="wbap-opt-model-btn" type="button">
                    <i class="fa-solid fa-microchip"></i>
                    <span id="wbap-opt-model-label">模型</span>
                </button>
                <div id="wbap-opt-model-pop" class="wbap-opt-popover wbap-opt-popover-sm wbap-hidden">
                    <div class="wbap-opt-pop-header">
                        <div>选择模型</div>
                        <div class="wbap-opt-pop-actions">
                            <button id="wbap-opt-model-refresh" class="wbap-opt-mini-btn" type="button">刷新</button>
                            <button id="wbap-opt-model-close" class="wbap-opt-icon-btn" type="button">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>
                    <div class="wbap-opt-pop-body-single">
                        <div id="wbap-opt-model-list" class="wbap-opt-list"></div>
                    </div>
                </div>
                <!-- 操作按钮 -->
                <button class="wbap-opt-chip wbap-opt-chip-btn wbap-opt-action-regen" id="wbap-opt-regen" type="button" title="重新生成">
                    <i class="fa-solid fa-rotate"></i>
                    <span>重试</span>
                </button>
                <button class="wbap-opt-chip wbap-opt-chip-btn wbap-opt-action-cancel wbap-hidden" id="wbap-opt-cancel" type="button" title="取消生成">
                    <i class="fa-solid fa-stop"></i>
                    <span>取消</span>
                </button>
            </div>
            <div class="wbap-opt-input-row">
                <textarea id="wbap-opt-input" class="wbap-opt-input" rows="1" placeholder="在此输入..."></textarea>
                <button id="wbap-opt-send" class="wbap-opt-send-btn" title="发送">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
            <!-- Level3 模式操作栏 -->
            <div class="wbap-opt-level3-actions wbap-hidden">
                <button class="wbap-opt-level3-btn wbap-opt-level3-skip" id="wbap-opt-skip" type="button">
                    <i class="fa-solid fa-forward"></i>
                    <span>跳过优化</span>
                </button>
                <button class="wbap-opt-level3-btn wbap-opt-level3-confirm" id="wbap-opt-confirm" type="button">
                    <i class="fa-solid fa-check"></i>
                    <span>确认并发送到ST</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;
    // 三级优化提示词编辑面板
    const LEVEL3_PROMPT_EDITOR_HTML = `
<div id="wbap-level3-prompt-editor" class="wbap-level3-editor wbap-hidden">
    <div class="wbap-level3-editor-overlay"></div>
    <div class="wbap-level3-editor-container">
        <div class="wbap-level3-editor-header">
            <span class="wbap-level3-editor-title">三级优化提示词编辑</span>
            <button id="wbap-level3-editor-close" class="wbap-opt-icon-btn" type="button">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="wbap-level3-editor-body">
            <div class="wbap-level3-field">
                <label for="wbap-level3-prompt-name">预设名称</label>
                <input id="wbap-level3-prompt-name" class="wbap-level3-input" type="text" placeholder="例如：默认优化提示词">
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-level3-prompt-desc">预设描述</label>
                <textarea id="wbap-level3-prompt-desc" class="wbap-level3-textarea" rows="3" placeholder="简要说明用途..."></textarea>
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-level3-system-prompt">系统提示词</label>
                <textarea id="wbap-level3-system-prompt" class="wbap-level3-textarea" rows="6" placeholder="定义AI的角色和行为规则..."></textarea>
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-level3-prompt-template">优化提示词模板</label>
                <textarea id="wbap-level3-prompt-template" class="wbap-level3-textarea" rows="8" placeholder="使用 {input} 代表待优化内容，{worldbook} 代表世界书摘录..."></textarea>
                <div class="wbap-level3-hint">
                    可用变量：<code>{input}</code> - 待优化内容，<code>{worldbook}</code> - 世界书摘录
                </div>
            </div>
        </div>
        <div class="wbap-level3-editor-footer">
            <button id="wbap-level3-reset" class="wbap-level3-btn-secondary" type="button">
                <i class="fa-solid fa-rotate-left"></i> 恢复默认
            </button>
            <button id="wbap-level3-save" class="wbap-level3-btn-primary" type="button">
                <i class="fa-solid fa-save"></i> 保存
            </button>
        </div>
    </div>
</div>
`;

    // 将模板缓存到全局命名空间
    window.WBAP.UI_TEMPLATES = {
        PANEL_HTML,
        PROMPT_EDITOR_HTML,
        SETTINGS_HTML,
        API_ENDPOINT_EDITOR_HTML,
        PROMPT_PICKER_HTML,
        PROGRESS_PANEL_HTML,
        OPTIMIZATION_PANEL_HTML,
        LEVEL3_PROMPT_EDITOR_HTML
    };

})();
