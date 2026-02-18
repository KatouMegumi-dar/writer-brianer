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
                <button id="wbap-summary-top-btn" class="wbap-btn wbap-btn-icon" title="大小总结">
                    <i class="fa-solid fa-book-bookmark"></i>
                </button>
                <button id="wbap-settings-btn" class="wbap-btn wbap-btn-icon" title="设置">
                    <i class="fa-solid fa-cog"></i>
                </button>
                <button id="wbap-tiagang-btn" class="wbap-btn wbap-btn-icon" title="\u5929\u7eb2">
                    <i class="fa-solid fa-compass"></i>
                </button>
                <button id="wbap-resp-opt-btn" class="wbap-btn wbap-btn-icon" title="正文优化">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                </button>
                <button id="wbap-table-display-btn" class="wbap-btn wbap-btn-icon" title="表格展示">
                    <i class="fa-solid fa-table"></i>
                </button>
                <button id="wbap-close-btn" class="wbap-btn wbap-btn-icon" title="关闭">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>
        </div>
        <div class="wbap-panel-content">

            <div class="wbap-section">
                <div class="wbap-section-header" style="align-items:center; gap:10px;">
                    <span class="wbap-section-title">记忆模块</span>
                    <span id="wbap-memory-status" class="wbap-badge">未启用</span>
                    <div style="flex:1"></div>
                    <button id="wbap-memory-open-btn" class="wbap-btn wbap-btn-xs wbap-btn-primary"><i class="fa-solid fa-brain"></i> 配置</button>
                </div>
                <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">发送前并发处理世界书，注入 Plot_progression 记忆块（索引合并/表格分列/标签过滤）。</div>
                
                <!-- 超级记忆功能区域 -->
                <div class="wbap-supermemory-toggle-area">
                    <div class="wbap-supermemory-toggle-row">
                        <label class="wbap-supermemory-switch">
                            <input type="checkbox" id="wbap_supermemory_toggle">
                            <span class="wbap-supermemory-switch-track">
                                <span class="wbap-supermemory-switch-thumb">
                                    <i class="fa-solid fa-bolt"></i>
                                </span>
                            </span>
                            <span class="wbap-supermemory-switch-label">
                                <i class="fa-solid fa-bolt"></i>
                                <span>超级记忆</span>
                                <small>Super Memory</small>
                            </span>
                        </label>
                        <div class="wbap-supermemory-actions">
                            <button id="wbap_view_graph_btn" class="wbap-btn wbap-btn-xs wbap-btn-graph" style="display: none;">
                                <i class="fa-solid fa-project-diagram"></i> 图谱
                            </button>
                            <button id="wbap_supermemory_config_btn" class="wbap-btn wbap-btn-xs wbap-btn-config">
                                <i class="fa-solid fa-cog"></i> 配置
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header" style="align-items:center; gap:10px;">
                    <span class="wbap-section-title">正文优化</span>
                    <span id="wbap-resp-opt-status" class="wbap-badge">未启用</span>
                    <div style="flex:1"></div>
                    <button id="wbap-resp-opt-open-btn" class="wbap-btn wbap-btn-xs wbap-btn-primary"><i class="fa-solid fa-wand-magic-sparkles"></i> 配置</button>
                </div>
                <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">拦截 AI 返回的正文内容，通过 LLM 优化后再显示给用户，提升文本质量。</div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header" style="align-items:center; gap:10px;">
                    <span class="wbap-section-title">大小总结</span>
                    <span id="wbap-summary-status" class="wbap-badge">就绪</span>
                    <div style="flex:1"></div>
                    <label class="wbap-toggle-switch" style="margin-right:8px;">
                        <input type="checkbox" id="wbap-summary-enabled" checked>
                        <span class="wbap-toggle-slider"></span>
                    </label>
                    <button id="wbap-summary-open-btn" class="wbap-btn wbap-btn-xs wbap-btn-primary"><i class="fa-solid fa-book-bookmark"></i> 打开</button>
                </div>
                <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">按楼层范围生成小总结/大总结,自动管理总结书条目。</div>
            </div>

            <div class="wbap-section" id="wbap-table-display-section">
                <div class="wbap-section-header" style="align-items:center; gap:10px;">
                    <span class="wbap-section-title">表格展示</span>
                    <span id="wbap-table-display-status" class="wbap-badge">未启用</span>
                    <div style="flex:1"></div>
                    <label class="wbap-toggle-switch" style="margin-right:8px;">
                        <input type="checkbox" id="wbap-table-display-enabled">
                        <span class="wbap-toggle-slider"></span>
                    </label>
                    <button id="wbap-table-display-open-btn" class="wbap-btn wbap-btn-xs wbap-btn-primary"><i class="fa-solid fa-table"></i> 配置</button>
                </div>
                <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">从 AI 回复中提取表格数据并展示，支持模板导入和编辑指令解析。</div>
            </div>

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
                    <button id="wbap-prompt-bind-apis-btn" class="wbap-btn wbap-btn-xs" title="绑定 API"><i class="fa-solid fa-link"></i> 绑定 API</button>
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
        </div>
    </div>
</div>`;
    // 大小总结面板
    const SUMMARY_PANEL_HTML = `
<div id="wbap-summary-panel" class="wbap-settings wbap-hidden">
    <div class="wbap-settings-container wbap-summary-container">
        <div class="wbap-settings-header">
            <div class="wbap-header-title-group">
                <div class="wbap-header-icon">
                    <i class="fa-solid fa-book-bookmark"></i>
                </div>
                <div class="wbap-header-text">
                    <h3>大小总结</h3>
                    <span class="wbap-header-subtitle">Summary Manager</span>
                </div>
            </div>
            <div class="wbap-summary-header-status" style="display: flex; align-items: center; gap: 12px; margin-right: auto; margin-left: 20px;">
                <div style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: rgba(167, 139, 250, 0.15); border-radius: 6px; border: 1px solid rgba(167, 139, 250, 0.3);">
                    <i class="fa-solid fa-check-circle" style="color: #a78bfa; font-size: 14px;"></i>
                    <span style="font-size: 13px; color: #e0e0e0;">上次总结到:</span>
                    <span id="wbap-summary-header-last-floor" style="font-size: 14px; font-weight: 600; color: #a78bfa;">0</span>
                    <span style="font-size: 13px; color: #e0e0e0;">楼</span>
                </div>
            </div>
            <button id="wbap-summary-close" class="wbap-btn wbap-btn-icon wbap-close-btn">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-settings-body wbap-summary-body">
            <!-- 当前状态 -->
            <div class="wbap-summary-info-bar">
                <div class="wbap-summary-info-item">
                    <i class="fa-solid fa-user"></i>
                    <span>角色: </span>
                    <span id="wbap-summary-char-name">未选择</span>
                </div>
                <div class="wbap-summary-info-item">
                    <i class="fa-solid fa-layer-group"></i>
                    <span>总楼层: </span>
                    <span id="wbap-summary-total-floors">0</span>
                </div>
                <div class="wbap-summary-info-item">
                    <i class="fa-solid fa-book"></i>
                    <span>总结书: </span>
                    <span id="wbap-summary-book-status">未创建</span>
                </div>
            </div>

            <!-- API 设置（独立） -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-server"></i>
                    <span>API 设置</span>
                    <button id="wbap-summary-api-test-btn" class="wbap-btn wbap-btn-xs">
                        <i class="fa-solid fa-plug"></i> 测试
                    </button>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-api-grid">
                        <div class="wbap-summary-input-group wbap-summary-full-width">
                            <label>API 接入渠道</label>
                            <select id="wbap-summary-api-channel" class="wbap-summary-input">
                                <option value="direct">直连模式 (Direct)</option>
                                <option value="st-backend">SillyTavern 后端 (ST Backend)</option>
                            </select>
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px; color: var(--wbap-text-muted);">
                                <span>💡 <strong>直连模式</strong>：直接调用外部API（需配置URL和Key）</span><br>
                                <span>💡 <strong>ST后端</strong>：通过SillyTavern后端代理（便于排查错误，可在ST控制台查看日志）</span>
                            </div>
                        </div>
                        <div class="wbap-summary-input-group wbap-summary-full-width">
                            <label>API URL</label>
                            <input type="text" id="wbap-summary-api-url" class="wbap-summary-input" placeholder="https://api.openai.com/v1">
                        </div>
                        <div class="wbap-summary-input-group wbap-summary-full-width">
                            <label>API Key</label>
                            <input type="password" id="wbap-summary-api-key" class="wbap-summary-input" placeholder="sk-...">
                        </div>
                        <div class="wbap-summary-input-group wbap-summary-full-width">
                            <label>模型名称</label>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <select id="wbap-summary-model" class="wbap-summary-input" style="flex:1;min-width:200px;">
                                    <option value="">请先获取模型列表</option>
                                </select>
                                <button id="wbap-summary-fetch-models" class="wbap-btn wbap-btn-xs wbap-btn-primary" title="获取模型列表">
                                    <i class="fa-solid fa-download"></i> 获取模型
                                </button>
                            </div>
                        </div>
                        <div class="wbap-summary-input-group">
                            <label>最大Token</label>
                            <input type="number" id="wbap-summary-max-tokens" class="wbap-summary-input" value="2048" min="100">
                        </div>
                    </div>

                    <!-- 高级参数 -->
                    <div class="wbap-summary-input-row">
                        <div class="wbap-summary-input-group">
                            <label>温度 (Temperature)</label>
                            <input type="number" id="wbap-summary-temperature" class="wbap-summary-input" value="0.7" min="0" max="2" step="0.1">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>控制输出随机性，0=确定性，2=最随机</span>
                            </div>
                        </div>
                        <div class="wbap-summary-input-group">
                            <label>超时时间（秒）</label>
                            <input type="number" id="wbap-summary-timeout" class="wbap-summary-input" value="120" min="30" max="600" step="10">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>API 请求超时时间（30-600秒）</span>
                            </div>
                        </div>
                    </div>

                    <div class="wbap-summary-input-row">
                        <div class="wbap-summary-input-group">
                            <label>Top P</label>
                            <input type="number" id="wbap-summary-top-p" class="wbap-summary-input" value="1.0" min="0" max="1" step="0.05">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>核采样参数，控制词汇多样性</span>
                            </div>
                        </div>
                        <div class="wbap-summary-input-group">
                            <label>重试次数</label>
                            <input type="number" id="wbap-summary-max-retries" class="wbap-summary-input" value="3" min="0" max="10" step="1">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>失败后的最大重试次数</span>
                            </div>
                        </div>
                    </div>

                    <div class="wbap-summary-input-row">
                        <div class="wbap-summary-input-group">
                            <label>Presence Penalty</label>
                            <input type="number" id="wbap-summary-presence-penalty" class="wbap-summary-input" value="0" min="-2" max="2" step="0.1">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>降低重复话题的概率</span>
                            </div>
                        </div>
                        <div class="wbap-summary-input-group">
                            <label>Frequency Penalty</label>
                            <input type="number" id="wbap-summary-frequency-penalty" class="wbap-summary-input" value="0" min="-2" max="2" step="0.1">
                            <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 11px;">
                                <span>降低重复词汇的概率</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 世界书设置 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-book-atlas"></i>
                    <span>世界书设置</span>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-input-group wbap-summary-full-width">
                        <label>默认激活模式</label>
                        <select id="wbap-summary-book-scan-depth" class="wbap-summary-input">
                            <option value="0">🟢 绿灯（关键词触发）</option>
                            <option value="1">🔵 蓝灯（始终激活）</option>
                        </select>
                        <div class="wbap-summary-hint" style="margin-top: 8px;">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>设置创建总结书时的默认激活模式</span>
                        </div>
                    </div>

                    <div class="wbap-summary-input-group wbap-summary-full-width">
                        <label>默认插入位置</label>
                        <select id="wbap-summary-book-insertion-order" class="wbap-summary-input">
                            <option value="0">角色定义之前</option>
                            <option value="1">角色定义之后</option>
                            <option value="2">作者注释之前</option>
                            <option value="3">作者注释之后</option>
                            <option value="4">@D 注入指定深度</option>
                        </select>
                        <div class="wbap-summary-hint" style="margin-top: 8px;">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>设置总结书条目的默认插入位置</span>
                        </div>
                    </div>

                    <div class="wbap-summary-input-group wbap-summary-full-width" id="wbap-summary-depth-container" style="display: none;">
                        <label>注入深度</label>
                        <input type="number" id="wbap-summary-book-depth" class="wbap-summary-input" min="0" max="100" value="10">
                        <div class="wbap-summary-hint" style="margin-top: 4px; font-size: 12px;">
                            <span>@D 注入模式下的深度值（0-100）</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 小总结区域 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-file-lines"></i>
                    <span>小总结</span>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-floor-inputs">
                        <div class="wbap-summary-input-group">
                            <label>起始楼层</label>
                            <input type="number" id="wbap-small-start-floor" class="wbap-summary-input" min="1" value="1">
                        </div>
                        <span class="wbap-summary-divider">-</span>
                        <div class="wbap-summary-input-group">
                            <label>结束楼层</label>
                            <input type="number" id="wbap-small-end-floor" class="wbap-summary-input" min="1" value="30">
                        </div>
                    </div>
                    <div class="wbap-summary-prompt-inline">
                        <label>小总结提示词</label>
                        <textarea id="wbap-small-summary-prompt-inline" class="wbap-summary-textarea" rows="4" placeholder="请对以下聊天记录进行总结..."></textarea>
                        <div class="wbap-summary-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>使用 {chat_content} 代表聊天内容</span>
                        </div>
                    </div>
                    <button id="wbap-small-summary-btn" class="wbap-btn wbap-btn-primary wbap-summary-execute-btn">
                        <i class="fa-solid fa-play"></i> 执行小总结
                    </button>
                </div>
            </div>

            <!-- 大总结区域 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-book"></i>
                    <span>大总结</span>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-floor-inputs">
                        <div class="wbap-summary-input-group">
                            <label>起始楼层</label>
                            <input type="number" id="wbap-large-start-floor" class="wbap-summary-input" min="1" value="1">
                        </div>
                        <span class="wbap-summary-divider">-</span>
                        <div class="wbap-summary-input-group">
                            <label>结束楼层</label>
                            <input type="number" id="wbap-large-end-floor" class="wbap-summary-input" min="1" value="60">
                        </div>
                    </div>
                    <div class="wbap-summary-option">
                        <label>
                            <input type="checkbox" id="wbap-delete-small-summaries" checked>
                            <span>删除范围内的小总结</span>
                        </label>
                    </div>
                    <div class="wbap-summary-prompt-inline">
                        <label>大总结提示词</label>
                        <textarea id="wbap-large-summary-prompt-inline" class="wbap-summary-textarea" rows="4" placeholder="请对以下聊天记录进行综合总结..."></textarea>
                        <div class="wbap-summary-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>使用 {chat_content} 代表聊天内容</span>
                        </div>
                    </div>

                    <!-- 大总结自动触发配置 -->
                    <div class="wbap-summary-auto-config">
                        <div class="wbap-summary-auto-header">
                            <i class="fa-solid fa-robot"></i>
                            <span>大总结自动触发</span>
                            <label class="wbap-summary-toggle">
                                <input type="checkbox" id="wbap-large-summary-auto-enabled">
                                <span>启用</span>
                            </label>
                        </div>
                        <div class="wbap-summary-auto-body" id="wbap-large-summary-auto-settings">
                            <div class="wbap-summary-hint" style="margin-bottom: 12px;">
                                <i class="fa-solid fa-info-circle"></i>
                                <span>基于小总结已维护的楼层数自动触发大总结</span>
                            </div>

                            <!-- 数据源选择 -->
                            <div class="wbap-summary-input-group wbap-summary-full-width" style="margin-bottom: 12px;">
                                <label>数据源</label>
                                <select id="wbap-large-summary-data-source" class="wbap-summary-input">
                                    <option value="small-summary">处理小总结数据（推荐）</option>
                                    <option value="floor">处理原始楼层数据</option>
                                </select>
                            </div>
                            <div class="wbap-summary-hint" style="margin-bottom: 12px;">
                                <i class="fa-solid fa-lightbulb"></i>
                                <span><strong>小总结数据：</strong>直接合并小总结内容，不弹出消息预览<br><strong>原始楼层数据：</strong>重新处理原始聊天记录，弹出消息预览供编辑</span>
                            </div>

                            <div class="wbap-summary-input-row">
                                <div class="wbap-summary-input-group">
                                    <label>触发阈值（楼）</label>
                                    <input type="number" id="wbap-large-summary-auto-threshold" class="wbap-summary-input" min="50" value="300">
                                </div>
                                <div class="wbap-summary-input-group">
                                    <label>保留层数（楼）</label>
                                    <input type="number" id="wbap-large-summary-auto-retention" class="wbap-summary-input" min="0" value="50">
                                </div>
                            </div>
                            <div class="wbap-summary-input-row">
                                <div class="wbap-summary-input-group">
                                    <label>单次批量（楼）</label>
                                    <input type="number" id="wbap-large-summary-batch-size" class="wbap-summary-input" min="10" value="50">
                                </div>
                            </div>
                            <div class="wbap-summary-hint">
                                <i class="fa-solid fa-lightbulb"></i>
                                <span>示例：小总结维护到300楼，保留50楼，则处理250楼。单次批量50楼，共5次，合并成一个大总结条目。</span>
                            </div>
                        </div>
                    </div>

                    <button id="wbap-large-summary-btn" class="wbap-btn wbap-btn-primary wbap-summary-execute-btn">
                        <i class="fa-solid fa-play"></i> 执行大总结
                    </button>
                </div>
            </div>

            <!-- 标签提取设置 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-tags"></i>
                    <span>标签提取</span>
                    <label class="wbap-summary-toggle">
                        <input type="checkbox" id="wbap-summary-tag-enabled">
                        <span>启用</span>
                    </label>
                </div>
                <div class="wbap-summary-section-body" id="wbap-summary-tag-settings">
                    <div class="wbap-summary-input-group wbap-summary-full-width">
                        <label>提取标签（逗号分隔）</label>
                        <input type="text" id="wbap-summary-tags" class="wbap-summary-input" placeholder="例如: 对话, 行动, 心理">
                    </div>
                    <div class="wbap-summary-hint">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>仅提取指定标签内的内容进行总结，如 &lt;对话&gt;...&lt;/对话&gt;</span>
                    </div>
                </div>
            </div>

            <!-- 批量总结 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-layer-group"></i>
                    <span>批量总结</span>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-hint" style="margin-bottom: 12px;">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>自动分批总结指定范围的楼层，适合大量历史记录的快速处理</span>
                    </div>

                    <!-- 紧凑型楼层输入 -->
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: flex-end;">
                        <div style="flex: 1; min-width: 80px;">
                            <label style="display: block; font-size: 12px; color: var(--wbap-text-secondary); margin-bottom: 4px;">起始楼层</label>
                            <input type="number" id="wbap-batch-start-floor" class="wbap-summary-input" style="height: 36px; padding: 6px 10px;" placeholder="1" min="1" value="1">
                        </div>
                        <div style="flex: 0 0 auto; padding-bottom: 8px; color: var(--wbap-text-secondary); font-size: 14px;">→</div>
                        <div style="flex: 1; min-width: 80px;">
                            <label style="display: block; font-size: 12px; color: var(--wbap-text-secondary); margin-bottom: 4px;">结束楼层</label>
                            <input type="number" id="wbap-batch-end-floor" class="wbap-summary-input" style="height: 36px; padding: 6px 10px;" placeholder="100" min="1">
                        </div>
                        <div style="flex: 0 0 auto; padding-bottom: 8px; color: var(--wbap-text-secondary); font-size: 14px;">×</div>
                        <div style="flex: 1; min-width: 80px;">
                            <label style="display: block; font-size: 12px; color: var(--wbap-text-secondary); margin-bottom: 4px;">单次批量</label>
                            <input type="number" id="wbap-batch-size" class="wbap-summary-input" style="height: 36px; padding: 6px 10px;" placeholder="30" min="1" value="30">
                        </div>
                    </div>

                    <div class="wbap-summary-hint" style="margin-bottom: 12px; font-size: 12px;">
                        <i class="fa-solid fa-lightbulb"></i>
                        <span>例如：1-100层，单次30层 → 分4批：1-30, 31-60, 61-90, 91-100</span>
                    </div>

                    <!-- 批量总结按钮 -->
                    <button id="wbap-batch-summary-btn" class="wbap-btn wbap-btn-primary" style="width: 100%;" data-state="idle">
                        <i class="fa-solid fa-rocket"></i>
                        <span>开始批量总结</span>
                    </button>

                    <!-- 进度文本显示 -->
                    <div id="wbap-batch-summary-progress-text" style="margin-top: 12px; padding: 12px; background: var(--wbap-card-bg); border: 1px solid var(--wbap-border-color); border-radius: 8px; display: none; font-size: 13px; color: var(--wbap-text-primary);">
                        <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i>
                        <span>准备中...</span>
                    </div>

                    <!-- 停止按钮 -->
                    <div id="wbap-batch-summary-progress" style="margin-top: 12px; display: none;">
                        <button id="wbap-batch-summary-stop-btn" class="wbap-btn" style="padding: 8px 16px; font-size: 13px; background: transparent; color: #ff7b7b; border: 1px solid #ff7b7b; border-radius: 8px; width: 100%; transition: all 0.2s; font-weight: 500; cursor: pointer;">
                            <i class="fa-solid fa-stop"></i>
                            <span style="margin-left: 6px;">停止</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 自动总结设置 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-robot"></i>
                    <span>自动总结</span>
                    <label class="wbap-summary-toggle">
                        <input type="checkbox" id="wbap-auto-summary-enabled">
                        <span>启用</span>
                    </label>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-input-group">
                        <label>触发阈值（未总结消息数）</label>
                        <input type="number" id="wbap-auto-summary-threshold" class="wbap-summary-input" min="5" value="20">
                        <div class="wbap-summary-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>当未总结的消息数达到此值时自动触发</span>
                        </div>
                    </div>

                    <div class="wbap-summary-input-group">
                        <label>保留层数（最新消息不总结）</label>
                        <input type="number" id="wbap-auto-summary-retention" class="wbap-summary-input" min="0" value="5">
                        <div class="wbap-summary-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>保留最近N条消息不进行总结</span>
                        </div>
                    </div>

                    <div class="wbap-summary-option">
                        <label>
                            <input type="checkbox" id="wbap-auto-summary-auto-execute" checked>
                            <span>自动执行（不弹窗确认）</span>
                        </label>
                    </div>

                    <div class="wbap-summary-info-item" style="margin-top: 12px;">
                        <i class="fa-solid fa-check-circle"></i>
                        <span>上次总结到: </span>
                        <span id="wbap-auto-summary-last-floor" style="font-weight: 600; color: var(--wbap-primary, #a78bfa);">0</span>
                        <span> 楼</span>
                    </div>

                    <!-- 调试按钮 -->
                    <div style="margin-top: 12px;">
                        <button id="wbap-debug-config-btn" class="wbap-btn wbap-btn-xs" style="width: 100%;">
                            <i class="fa-solid fa-bug"></i> 调试配置
                        </button>
                    </div>

                    <!-- 一键总结按钮 -->
                    <div class="wbap-summary-expedition" style="margin-top: 16px;">
                        <button id="wbap-expedition-btn" class="wbap-btn wbap-btn-primary" style="width: 100%;" data-state="idle">
                            <i class="fa-solid fa-flag-checkered"></i>
                            <span>开始远征</span>
                        </button>

                        <!-- 远征进度文本显示 -->
                        <div id="wbap-expedition-progress-text" style="margin-top: 12px; padding: 12px; background: var(--wbap-card-bg); border: 1px solid var(--wbap-border-color); border-radius: 8px; display: none; font-size: 13px; color: var(--wbap-text-primary);">
                            <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i>
                            <span>准备中...</span>
                        </div>

                        <div class="wbap-summary-hint" style="margin-top: 8px;">
                            <i class="fa-solid fa-info-circle"></i>
                            <span>一键总结所有未归档的历史记录</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 史册归档与回溯 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-scroll"></i>
                    <span>史册归档与回溯</span>
                </div>
                <div class="wbap-summary-section-body">
                    <div class="wbap-summary-hint" style="margin-bottom: 12px;">
                        <i class="fa-solid fa-info-circle"></i>
                        <span>管理多条时间线的史册，随时封存或重启旧的历史</span>
                    </div>

                    <!-- 归档当前按钮 -->
                    <button id="wbap-archive-current-btn" class="wbap-btn wbap-btn-primary" style="width: 100%; margin-bottom: 12px;">
                        <i class="fa-solid fa-archive"></i>
                        <span>归档当前</span>
                    </button>
                    <div class="wbap-summary-hint" style="margin-bottom: 16px; font-size: 12px;">
                        <span>将当前所有大小总结条目合并归档并禁用</span>
                    </div>

                    <!-- 回溯选择器 -->
                    <div class="wbap-summary-input-group" style="margin-bottom: 12px;">
                        <label>选择要回溯的旧史册</label>
                        <select id="wbap-archive-selector" class="wbap-summary-input">
                            <option value="">加载中...</option>
                        </select>
                    </div>

                    <!-- 回溯和刷新按钮 -->
                    <div style="display: flex; gap: 8px;">
                        <button id="wbap-restore-archive-btn" class="wbap-btn wbap-btn-primary" style="flex: 1;">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                            <span>回溯选中</span>
                        </button>
                        <button id="wbap-refresh-archive-list-btn" class="wbap-btn" style="padding: 0 16px;">
                            <i class="fa-solid fa-rotate"></i>
                        </button>
                    </div>
                </div>
            </div>

            <!-- 已有总结列表 -->
            <div class="wbap-summary-section">
                <div class="wbap-summary-section-header">
                    <i class="fa-solid fa-list"></i>
                    <span>已有总结</span>
                    <button id="wbap-summary-refresh-btn" class="wbap-btn wbap-btn-xs">
                        <i class="fa-solid fa-refresh"></i> 刷新
                    </button>
                </div>
                <div class="wbap-summary-section-body">
                    <div id="wbap-summary-list" class="wbap-summary-list">
                        <div class="wbap-summary-list-empty">暂无总结</div>
                    </div>
                </div>
            </div>

            <!-- 进度显示 -->
            <div id="wbap-summary-progress" class="wbap-summary-progress wbap-hidden">
                <div class="wbap-summary-progress-bar">
                    <div id="wbap-summary-progress-fill" class="wbap-summary-progress-fill"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
                    <div id="wbap-summary-progress-text" class="wbap-summary-progress-text">准备中...</div>
                    <button id="wbap-summary-stop-btn" class="wbap-btn" style="padding: 4px 12px; font-size: 13px;">
                        <i class="fa-solid fa-stop"></i>
                        <span>停止</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 交互式预览面板 -->
<div id="wbap-summary-preview-modal" class="wbap-modal wbap-hidden">
    <div class="wbap-modal-overlay"></div>
    <div class="wbap-modal-container">
        <div class="wbap-modal-header">
            <h3>总结预览</h3>
            <button id="wbap-preview-close" class="wbap-btn wbap-btn-icon">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-modal-content">
            <!-- 楼层范围信息 -->
            <div class="wbap-preview-info">
                <i class="fa-solid fa-info-circle"></i>
                <span>将总结 <strong id="wbap-preview-range">1-20</strong> 楼的内容</span>
            </div>

            <!-- 过滤选项 -->
            <div class="wbap-preview-filters">
                <label>
                    <input type="checkbox" id="wbap-preview-include-user" checked>
                    <span id="wbap-preview-user-label">用户消息</span>
                </label>
                <label>
                    <input type="checkbox" id="wbap-preview-include-char" checked>
                    <span id="wbap-preview-char-label">AI 回复</span>
                </label>
                <button id="wbap-preview-expand-all" class="wbap-btn wbap-btn-sm" style="margin-left: auto;">
                    <i class="fa-solid fa-chevron-down"></i> 全部展开
                </button>
                <button id="wbap-preview-collapse-all" class="wbap-btn wbap-btn-sm">
                    <i class="fa-solid fa-chevron-up"></i> 全部折叠
                </button>
            </div>

            <!-- 楼层内容列表 -->
            <div id="wbap-preview-messages" class="wbap-preview-messages">
                <!-- 动态生成 -->
            </div>
        </div>
        <div class="wbap-modal-footer">
            <button id="wbap-preview-confirm" class="wbap-btn wbap-btn-primary">
                <i class="fa-solid fa-check"></i> 确认总结
            </button>
            <button id="wbap-preview-cancel" class="wbap-btn">
                <i class="fa-solid fa-times"></i> 取消
            </button>
        </div>
    </div>
</div>

<!-- 总结结果预览面板 -->
<div id="wbap-summary-result-modal" class="wbap-modal wbap-hidden">
    <div class="wbap-modal-overlay"></div>
    <div class="wbap-modal-container">
        <div class="wbap-modal-header">
            <h3>总结结果预览</h3>
            <button id="wbap-result-close" class="wbap-btn wbap-btn-icon">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-modal-content">
            <!-- 楼层范围信息 -->
            <div class="wbap-preview-info">
                <i class="fa-solid fa-check-circle"></i>
                <span>已生成 <strong id="wbap-result-range">1-20</strong> 楼的总结</span>
            </div>

            <!-- 总结内容 -->
            <div class="wbap-result-content">
                <label>总结内容：</label>
                <textarea id="wbap-result-summary" class="text_pole" style="height: 400px; resize: vertical;"></textarea>
            </div>
        </div>
        <div class="wbap-modal-footer">
            <button id="wbap-result-regenerate" class="wbap-btn wbap-btn-warning">
                <i class="fa-solid fa-rotate"></i> 重新生成
            </button>
            <button id="wbap-result-confirm" class="wbap-btn wbap-btn-primary">
                <i class="fa-solid fa-save"></i> 确认保存
            </button>
            <button id="wbap-result-cancel" class="wbap-btn">
                <i class="fa-solid fa-times"></i> 取消
            </button>
        </div>
    </div>
</div>
`;

    const SUPER_MEMORY_SETTINGS_HTML = `
<div id="wbap-supermemory-settings" class="wbap-settings">
    <div class="wbap-settings-container wbap-supermemory-container">
        <div class="wbap-settings-header wbap-supermemory-header">
            <div class="wbap-header-title-group">
                <div class="wbap-header-icon">
                    <i class="fa-solid fa-brain"></i>
                </div>
                <div class="wbap-header-text">
                    <h3>超级记忆</h3>
                    <span class="wbap-header-subtitle">Super Memory System</span>
                </div>
            </div>
            <button id="wbap-supermemory-close" class="wbap-btn wbap-btn-icon wbap-close-btn">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-settings-content wbap-supermemory-content">

            <!-- 世界书范围卡片 -->
            <div class="wbap-card wbap-card-worldbook">
                <div class="wbap-card-header">
                    <div class="wbap-card-icon wbap-icon-book">
                        <i class="fa-solid fa-book-atlas"></i>
                    </div>
                    <div class="wbap-card-title">
                        <span>世界书范围</span>
                        <small>Worldbook Scope</small>
                    </div>
                </div>
                <div class="wbap-card-body">
                    <p class="wbap-hint">选择用于构建知识图谱的世界书，只有被勾选的内容才会被索引</p>
                    <div class="wbap-worldbook-selector">
                        <select id="wbap-supermemory-worldbook-select" class="wbap-select-modern"></select>
                        <button id="wbap-supermemory-worldbook-add" class="wbap-btn-add">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    <div id="wbap-supermemory-selected-worldbooks" class="wbap-tag-container"></div>
                </div>
            </div>

            <!-- 智能代理配置卡片 -->
            <div class="wbap-card wbap-card-agents">
                <div class="wbap-card-header">
                    <div class="wbap-card-icon wbap-icon-agents">
                        <i class="fa-solid fa-users-gear"></i>
                    </div>
                    <div class="wbap-card-title">
                        <span>智能代理</span>
                        <small>AI Agents</small>
                    </div>
                </div>
                <div class="wbap-card-body">
                    <p class="wbap-hint">配置负责检索和分析的三个核心代理</p>

                    <div class="wbap-agent-tabs">
                        <div class="wbap-agent-tab active" data-tab="archivist">
                            <i class="fa-solid fa-archive"></i>
                            <span>档案员</span>
                        </div>
                        <div class="wbap-agent-tab" data-tab="historian">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                            <span>历史学家</span>
                        </div>
                        <div class="wbap-agent-tab" data-tab="status_reader">
                            <i class="fa-solid fa-chart-line"></i>
                            <span>状态读取</span>
                        </div>
                    </div>

                    <div id="wbap-agent-config-container" class="wbap-agent-config">
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-server"></i> API 实例</label>
                            <select id="wbap-agent-endpoint-select" class="wbap-select-modern">
                                <option value="">-- 使用独立配置或默认 --</option>
                            </select>
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-link"></i> API URL</label>
                            <input type="text" id="wbap-agent-api-url" class="wbap-input-modern" placeholder="https://api.openai.com/v1/chat/completions">
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-key"></i> API Key</label>
                            <input type="password" id="wbap-agent-api-key" class="wbap-input-modern" placeholder="sk-...">
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-microchip"></i> 模型</label>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <select id="wbap-agent-model" class="wbap-select-modern" style="flex:1;min-width:0;">
                                    <option value="">留空使用实例默认模型</option>
                                </select>
                                <button id="wbap-agent-fetch-models" class="wbap-btn-action wbap-btn-primary" style="white-space:nowrap;padding:6px 12px;">
                                    <i class="fa-solid fa-download"></i> 获取模型
                                </button>
                            </div>
                        </div>
                        <div class="wbap-form-row wbap-form-row-full">
                            <label><i class="fa-solid fa-terminal"></i> 系统提示词</label>
                            <textarea id="wbap-agent-system-prompt" class="wbap-textarea-modern" rows="5" placeholder="自定义代理的行为指令..."></textarea>
                        </div>
                    </div>
                </div>
            </div>

            <!-- PEDSA 引擎卡片 -->
            <div class="wbap-card wbap-card-pedsa">
                <div class="wbap-card-header">
                    <div class="wbap-card-icon wbap-icon-pedsa">
                        <i class="fa-solid fa-bolt"></i>
                    </div>
                    <div class="wbap-card-title">
                        <span>PEDSA 引擎</span>
                        <small>Fast Retrieval Engine</small>
                    </div>
                </div>
                <div class="wbap-card-body">
                    <p class="wbap-hint">高速预检索引擎，大幅提升检索效率</p>

                    <!-- 一阶段：PEDSA-JS -->
                    <div class="wbap-pedsa-stage wbap-pedsa-stage-1">
                        <div class="wbap-stage-header">
                            <div class="wbap-stage-badge wbap-badge-js">JS</div>
                            <div class="wbap-stage-info">
                                <span class="wbap-stage-title">一阶段：PEDSA-JS</span>
                                <span class="wbap-stage-desc">纯 JavaScript 本地引擎</span>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-pedsa-js-enabled" checked>
                            </label>
                        </div>
                        <div id="wbap-pedsa-js-stats" class="wbap-stats-panel wbap-stats-js" style="display:none;">
                            <div class="wbap-stat-item">
                                <span class="wbap-stat-label">引擎状态</span>
                                <span id="wbap-pedsa-js-status" class="wbap-stat-value wbap-status-pending">未初始化</span>
                            </div>
                            <div class="wbap-stat-item">
                                <span class="wbap-stat-label">节点数</span>
                                <span id="wbap-pedsa-js-nodes" class="wbap-stat-value">-</span>
                            </div>
                            <div class="wbap-stat-item">
                                <span class="wbap-stat-label">检索耗时</span>
                                <span id="wbap-pedsa-js-time" class="wbap-stat-value">-</span>
                            </div>
                            <div class="wbap-stat-item wbap-latency-item">
                                <span class="wbap-stat-label"><i class="fa-solid fa-wifi"></i> 延迟</span>
                                <span id="wbap-pedsa-js-latency" class="wbap-stat-value wbap-latency-value">-</span>
                            </div>
                        </div>
                    </div>

                    <!-- 二阶段：PEDSA-WASM -->
                    <div class="wbap-pedsa-stage wbap-pedsa-stage-2">
                        <div class="wbap-stage-header">
                            <div class="wbap-stage-badge wbap-badge-wasm">WASM</div>
                            <div class="wbap-stage-info">
                                <span class="wbap-stage-title">二阶段：PEDSA-WASM</span>
                                <span class="wbap-stage-desc">高性能 WebAssembly 引擎</span>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-pedsa-rust-enabled">
                            </label>
                        </div>
                        <div id="wbap-pedsa-rust-config" class="wbap-rust-config" style="display:none;">
                            <div id="wbap-pedsa-rust-status" class="wbap-stats-panel wbap-stats-rust">
                                <div class="wbap-stat-item">
                                    <span class="wbap-stat-label">引擎状态</span>
                                    <span id="wbap-pedsa-rust-service-status" class="wbap-stat-value wbap-status-pending">待初始化</span>
                                </div>
                                <div class="wbap-stat-item wbap-latency-item">
                                    <span class="wbap-stat-label"><i class="fa-solid fa-wifi"></i> 延迟</span>
                                    <span id="wbap-pedsa-wasm-latency" class="wbap-stat-value wbap-latency-value">-</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="wbap-action-row">
                        <button id="wbap-pedsa-refresh-stats" class="wbap-btn-action">
                            <i class="fa-solid fa-rotate"></i> 刷新状态
                        </button>
                        <button id="wbap-pedsa-clear-cache" class="wbap-btn-action wbap-btn-danger">
                            <i class="fa-solid fa-trash-can"></i> 清除缓存
                        </button>
                    </div>
                </div>
            </div>

            <!-- AI 工具调用卡片 -->
            <div class="wbap-card wbap-card-fc">
                <div class="wbap-card-header">
                    <div class="wbap-card-icon wbap-icon-fc">
                        <i class="fa-solid fa-screwdriver-wrench"></i>
                    </div>
                    <div class="wbap-card-title">
                        <span>AI 工具调用</span>
                        <small>Function Calling</small>
                    </div>
                </div>
                <div class="wbap-card-body">
                    <p class="wbap-hint">允许 AI 代理自主调用 PEDSA 引擎进行多轮语义检索</p>

                    <div class="wbap-toggle-group">
                        <div class="wbap-toggle-item">
                            <div class="wbap-toggle-info">
                                <i class="fa-solid fa-power-off"></i>
                                <div>
                                    <span>启用 Function Calling</span>
                                    <small>代理可自主调用 pedsa_retrieve 工具</small>
                                </div>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-fc-enabled">
                            </label>
                        </div>
                    </div>

                    <div id="wbap-fc-config-panel" class="wbap-fc-config" style="display:none;">
                        <div class="wbap-form-grid">
                            <div class="wbap-form-row">
                                <label><i class="fa-solid fa-repeat"></i> 最大轮次</label>
                                <div class="wbap-input-with-hint">
                                    <input type="number" id="wbap-fc-max-rounds" class="wbap-input-modern" value="3" min="1" max="10" step="1">
                                    <span class="wbap-input-hint">1 - 10</span>
                                </div>
                            </div>
                            <div class="wbap-form-row">
                                <label><i class="fa-solid fa-text-width"></i> 结果长度上限</label>
                                <div class="wbap-input-with-hint">
                                    <input type="number" id="wbap-fc-max-result-length" class="wbap-input-modern" value="4000" min="500" max="16000" step="500">
                                    <span class="wbap-input-hint">500 - 16000</span>
                                </div>
                            </div>
                        </div>

                        <div class="wbap-fc-agent-overrides" style="margin-top: 12px;">
                            <p class="wbap-hint" style="margin-bottom: 8px;"><i class="fa-solid fa-sliders"></i> 按代理单独开关（默认跟随全局）</p>
                            <div class="wbap-toggle-group">
                                <div class="wbap-toggle-item">
                                    <div class="wbap-toggle-info">
                                        <i class="fa-solid fa-archive"></i>
                                        <span>档案员</span>
                                    </div>
                                    <label class="wbap-toggle">
                                        <input type="checkbox" id="wbap-fc-agent-archivist" checked>
                                    </label>
                                </div>
                                <div class="wbap-toggle-item">
                                    <div class="wbap-toggle-info">
                                        <i class="fa-solid fa-clock-rotate-left"></i>
                                        <span>历史学家</span>
                                    </div>
                                    <label class="wbap-toggle">
                                        <input type="checkbox" id="wbap-fc-agent-historian" checked>
                                    </label>
                                </div>
                                <div class="wbap-toggle-item">
                                    <div class="wbap-toggle-info">
                                        <i class="fa-solid fa-chart-line"></i>
                                        <span>状态读取</span>
                                    </div>
                                    <label class="wbap-toggle">
                                        <input type="checkbox" id="wbap-fc-agent-status_reader" checked>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 多维知识图谱卡片 -->
            <div class="wbap-card wbap-card-graph">
                <div class="wbap-card-header">
                    <div class="wbap-card-icon wbap-icon-graph">
                        <i class="fa-solid fa-diagram-project"></i>
                    </div>
                    <div class="wbap-card-title">
                        <span>多维知识图谱</span>
                        <small>Knowledge Graph</small>
                    </div>
                </div>
                <div class="wbap-card-body">
                    <p class="wbap-hint">智能筛选最相关的世界书内容</p>

                    <div class="wbap-toggle-group">
                        <div class="wbap-toggle-item">
                            <div class="wbap-toggle-info">
                                <i class="fa-solid fa-magnifying-glass-chart"></i>
                                <div>
                                    <span>图谱智能检索</span>
                                    <small>基于多维能量扩散算法</small>
                                </div>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-graph-retrieval-enabled" checked>
                            </label>
                        </div>
                        <div class="wbap-toggle-item">
                            <div class="wbap-toggle-info">
                                <i class="fa-solid fa-wand-magic-sparkles"></i>
                                <div>
                                    <span>LLM 增量维护</span>
                                    <small>自动提取新关系（消耗 API）</small>
                                </div>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-graph-llm-update-enabled" checked>
                            </label>
                        </div>
                        <div class="wbap-toggle-item">
                            <div class="wbap-toggle-info">
                                <i class="fa-solid fa-pen-to-square"></i>
                                <div>
                                    <span>写入世界书</span>
                                    <small>将维护结果持久化（谨慎开启）</small>
                                </div>
                            </div>
                            <label class="wbap-toggle">
                                <input type="checkbox" id="wbap-graph-write-worldbook-enabled">
                            </label>
                        </div>
                    </div>

                    <div class="wbap-form-grid">
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-server"></i> 维护 API 实例</label>
                            <select id="wbap-graph-update-endpoint" class="wbap-select-modern"></select>
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-link"></i> 维护 API URL</label>
                            <input type="text" id="wbap-graph-api-url" class="wbap-input-modern" placeholder="https://api.openai.com/v1/chat/completions">
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-key"></i> 维护 API Key</label>
                            <input type="password" id="wbap-graph-api-key" class="wbap-input-modern" placeholder="sk-...">
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-microchip"></i> 维护模型</label>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <select id="wbap-graph-update-model" class="wbap-select-modern" style="flex:1;min-width:0;">
                                    <option value="">留空使用默认</option>
                                </select>
                                <button id="wbap-graph-fetch-models" class="wbap-btn-action wbap-btn-primary" style="white-space:nowrap;padding:6px 12px;">
                                    <i class="fa-solid fa-download"></i> 获取模型
                                </button>
                            </div>
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-sliders"></i> 能量阈值</label>
                            <div class="wbap-input-with-hint">
                                <input type="number" id="wbap-graph-energy-threshold" class="wbap-input-modern" value="0.1" min="0.01" max="0.5" step="0.01">
                                <span class="wbap-input-hint">0.01 - 0.5</span>
                            </div>
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-book"></i> 写入目标世界书</label>
                            <select id="wbap-graph-write-worldbook-target" class="wbap-select-modern"></select>
                        </div>
                        <div class="wbap-form-row">
                            <label><i class="fa-solid fa-list-ol"></i> 最多写入条目</label>
                            <div class="wbap-input-with-hint">
                                <input type="number" id="wbap-graph-write-worldbook-max" class="wbap-input-modern" value="3" min="0" max="10" step="1">
                                <span class="wbap-input-hint">0 - 10</span>
                            </div>
                        </div>
                    </div>

                    <div class="wbap-action-row wbap-action-row-3">
                        <button id="wbap-graph-view-btn" class="wbap-btn-action wbap-btn-primary">
                            <i class="fa-solid fa-eye"></i> 查看
                        </button>
                        <button id="wbap-graph-manual-update-btn" class="wbap-btn-action">
                            <i class="fa-solid fa-rotate"></i> 维护
                        </button>
                        <button id="wbap-graph-clear-dynamic-btn" class="wbap-btn-action wbap-btn-danger">
                            <i class="fa-solid fa-trash-can"></i> 清除
                        </button>
                    </div>
                    <div id="wbap-graph-stats" class="wbap-stats-panel wbap-stats-graph" style="display:none;"></div>
                </div>
            </div>

        </div>
        <div class="wbap-settings-footer wbap-supermemory-footer">
            <button id="wbap-supermemory-save" class="wbap-btn-save">
                <i class="fa-solid fa-check"></i> 保存设置
            </button>
        </div>
    </div>
</div>`;

    const PROMPT_EDITOR_HTML = `
<div id="wbap-prompt-editor-modal" class="wbap-modal">
    <div class="wbap-modal-content" style="width: 900px; max-width: 95vw; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="wbap-modal-header">
            <h3 id="wbap-prompt-editor-title">编辑提示词模板</h3>
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
                 <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-selective-mode-enabled">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">启用自选模式</span>
                </label>
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
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-agg-allow-duplicate">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">允许总局与主提示词重复执行</span>
                </label>
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
                <div class="wbap-form-group">
                    <label>标签提取名称（背景约束）</label>
                    <input type="text" id="wbap-tag-extraction-name" placeholder="例如：牖空">
                    <small class="wbap-text-muted">一级并发分析时，会从世界书中提取该名称相关资料，仅作背景参考，禁止单独输出。</small>
                </div>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-merge-worldbooks">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">合并多个世界书内容（每个端点仅请求一次）</span>
                </label>
                <label class="wbap-switch-label" style="margin-top: 6px;">
                    <input type="checkbox" id="wbap-use-selected-worldbooks">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">叠加当前聊天中勾选的世界书</span>
                </label>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-settings-progress-panel">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">显示处理进度面板</span>
                </label>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-settings-float-button">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">显示悬浮球（关闭后可通过扩展菜单打开）</span>
                </label>
            </div>

            <div class="wbap-section" id="wbap-super-concurrency-section">
                <div class="wbap-section-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span class="wbap-section-title">超级并发（内阁）</span>
                    <label style="font-size: 12px; color: var(--wbap-text-muted); display: inline-flex; gap: 6px; align-items: center;">
                        <input type="checkbox" id="wbap-super-concurrency">
                        启用
                    </label>
                </div>
                <div id="wbap-super-concurrency-body" class="wbap-hidden">
                    <div class="wbap-form-group">
                        <label>讨论等级</label>
                        <select id="wbap-super-concurrency-mode" class="wbap-preset-select">
                            <option value="basic">初级：并行出稿 + 宰相合并</option>
                            <option value="advanced">高级：多轮互评 + 宰相合并</option>
                        </select>
                    </div>
                    <div class="wbap-form-group" id="wbap-super-concurrency-rounds-row">
                        <label>互评轮数</label>
                        <input type="number" id="wbap-super-concurrency-rounds" min="1" max="5" value="1" style="width: 140px;">
                        <small class="wbap-text-muted">仅在高级模式生效，建议 1-3 轮。</small>
                    </div>
                    <div class="wbap-form-group">
                        <label>
                            <input type="checkbox" id="wbap-super-concurrency-show-panel">
                            显示内阁面板
                        </label>
                    </div>
                    <div class="wbap-form-group">
                        <button id="wbap-open-cabinet-panel" class="wbap-btn wbap-btn-secondary wbap-btn-xs">打开内阁面板</button>
                    </div>

                    <div class="wbap-section-header" style="margin-top: 8px;">
                        <span class="wbap-section-title">内阁提示词</span>
                    </div>
                    <div class="wbap-form-group">
                        <select id="wbap-cabinet-prompt-select" class="wbap-preset-select"></select>
                    </div>
                    <div id="wbap-cabinet-prompt-description" class="wbap-prompt-description"></div>
                    <div class="wbap-prompt-actions-toolbar">
                        <button id="wbap-cabinet-prompt-new-btn" class="wbap-btn wbap-btn-xs" title="新建"><i class="fa-solid fa-plus"></i> 新建</button>
                        <button id="wbap-cabinet-prompt-import-btn" class="wbap-btn wbap-btn-xs" title="导入"><i class="fa-solid fa-download"></i> 导入</button>
                        <button id="wbap-cabinet-prompt-edit-btn" class="wbap-btn wbap-btn-xs" title="编辑"><i class="fa-solid fa-pencil"></i> 编辑</button>
                        <button id="wbap-cabinet-prompt-export-btn" class="wbap-btn wbap-btn-xs" title="导出"><i class="fa-solid fa-upload"></i> 导出</button>
                        <button id="wbap-cabinet-prompt-delete-btn" class="wbap-btn wbap-btn-xs wbap-btn-danger" title="删除"><i class="fa-solid fa-trash"></i> 删除</button>
                    </div>
                    <input type="file" id="wbap-cabinet-prompt-file-input" accept=".json" class="wbap-hidden">

                    <div id="wbap-cabinet-variables-container" class="wbap-variables-container"></div>
                    <button id="wbap-cabinet-save-variables-btn" class="wbap-btn wbap-btn-primary" style="width: 100%; margin-top: 10px;">应用变量</button>
                    <div class="wbap-text-muted" style="font-size: 12px; margin-top: 6px;">
                        可用变量：<code>{role_name}</code>、<code>{role_type}</code>、<code>{endpoint_name}</code>、<code>{model_name}</code>、<code>{review_round}</code>
                    </div>
                </div>
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
                                <label>最大令牌数</label>
                                <input type="number" id="wbap-optimization-max-tokens" min="0" value="4000">
                            </div>
                            <div class="wbap-form-group">
                                <label>温度</label>
                                <input type="number" id="wbap-optimization-temperature" min="0" max="2" step="0.1" value="0.7">
                            </div>
                        </div>
                        <div class="wbap-form-row">
                            <div class="wbap-form-group">
                                <label>超时时间 (秒)</label>
                                <input type="number" id="wbap-optimization-timeout" min="0" value="60">
                            </div>
                            <div class="wbap-form-group">
                                <label>最大重试次数</label>
                                <input type="number" id="wbap-optimization-max-retries" min="0" value="2">
                            </div>
                        </div>
                        <div class="wbap-form-row">
                            <div class="wbap-form-group">
                                <label>重试延迟 (毫秒)</label>
                                <input type="number" id="wbap-optimization-retry-delay" min="0" value="800">
                            </div>
                            <div class="wbap-form-group">
                                <label>流式输出</label>
                                <label style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                                    <input type="checkbox" id="wbap-optimization-streaming" checked>
                                    启用
                                </label>
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

    const TIANGANG_SETTINGS_HTML = `
<div id="wbap-tiagang-settings" class="wbap-settings">
    <div class="wbap-settings-container">
        <div class="wbap-settings-header">
            <h3>\u5929\u7eb2</h3>
            <button id="wbap-tiagang-close" class="wbap-btn wbap-btn-icon">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-settings-content">
            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">\u5929\u7eb2\u6a21\u5757</span>
                </div>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-tiagang-enabled">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">\u542f\u7528\u5929\u7eb2\u81ea\u52a8\u5904\u7406</span>
                </label>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">\u63d0\u793a\u8bcd\u9884\u8bbe</span>
                </div>
                <div class="wbap-form-group">
                    <select id="wbap-tiagang-prompt-select" class="wbap-preset-select"></select>
                </div>
                <div id="wbap-tiagang-prompt-description" class="wbap-prompt-description"></div>
                <div class="wbap-prompt-actions-toolbar">
                    <button id="wbap-tiagang-prompt-new-btn" class="wbap-btn wbap-btn-xs" title="\u65b0\u5efa"><i class="fa-solid fa-plus"></i> \u65b0\u5efa</button>
                    <button id="wbap-tiagang-prompt-import-btn" class="wbap-btn wbap-btn-xs" title="\u5bfc\u5165"><i class="fa-solid fa-download"></i> \u5bfc\u5165</button>
                    <button id="wbap-tiagang-prompt-edit-btn" class="wbap-btn wbap-btn-xs" title="\u7f16\u8f91"><i class="fa-solid fa-pencil"></i> \u7f16\u8f91</button>
                    <button id="wbap-tiagang-prompt-export-btn" class="wbap-btn wbap-btn-xs" title="\u5bfc\u51fa"><i class="fa-solid fa-upload"></i> \u5bfc\u51fa</button>
                    <button id="wbap-tiagang-prompt-delete-btn" class="wbap-btn wbap-btn-xs wbap-btn-danger" title="\u5220\u9664"><i class="fa-solid fa-trash"></i> \u5220\u9664</button>
                </div>
                <input type="file" id="wbap-tiagang-prompt-file-input" accept=".json" class="wbap-hidden">

                <div id="wbap-tiagang-variables-container" class="wbap-variables-container"></div>
                <button id="wbap-tiagang-save-variables-btn" class="wbap-btn wbap-btn-primary" style="width: 100%; margin-top: 10px;">\u5e94\u7528\u53d8\u91cf</button>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">\u4e16\u754c\u4e66\u4e0e\u6761\u76ee</span>
                </div>
                <div class="wbap-form-group">
                    <label>\u9009\u62e9\u4e16\u754c\u4e66\uff08\u53ef\u591a\u9009\uff09</label>
                    <div class="wbap-input-group" style="gap: 8px; flex-wrap: wrap;">
                        <select id="wbap-tiagang-worldbook-select"></select>
                        <button id="wbap-tiagang-worldbook-add" class="wbap-btn wbap-btn-secondary wbap-btn-xs">\u6dfb\u52a0</button>
                    </div>
                    <div id="wbap-tiagang-selected-worldbooks" class="wbap-tag-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
                </div>

                <div class="wbap-form-group" style="flex: 1; display: flex; gap: 12px; overflow: hidden;">
                    <div id="wbap-tiagang-worldbook-list-column" style="width: 150px; border: 1px solid var(--wbap-border, #444); border-radius: 4px; overflow-y: auto; background: var(--wbap-bg-secondary);">
                        <div id="wbap-tiagang-book-list-container" class="wbap-book-list-container">
                            <p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">\u8bf7\u5148\u6dfb\u52a0\u4e16\u754c\u4e66</p>
                        </div>
                    </div>

                    <div id="wbap-tiagang-entry-list-column" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                            <label style="margin: 0;">\u9009\u62e9\u6761\u76ee</label>
                            <div style="display: flex; gap: 6px;">
                                <button id="wbap-tiagang-entries-select-all" class="wbap-btn wbap-btn-secondary wbap-btn-xs">\u5168\u9009</button>
                                <button id="wbap-tiagang-entries-clear" class="wbap-btn wbap-btn-secondary wbap-btn-xs">\u53d6\u6d88\u5168\u9009</button>
                            </div>
                        </div>
                        <div id="wbap-tiagang-entry-list" style="overflow-y: auto; border: 1px solid var(--wbap-border, #444); padding: 8px; border-radius: 4px; flex: 1;">
                            <p class="wbap-text-muted" style="text-align: center; font-size: 12px;">\u8bf7\u4ece\u5de6\u4fa7\u9009\u62e9\u4e00\u672c\u4e16\u754c\u4e66</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">\u4e0a\u4e0b\u6587\u8f6e\u6b21</span>
                </div>
                <div class="wbap-form-group">
                    <label>\u4e0a\u4e0b\u6587\u8f6e\u6b21</label>
                    <div class="wbap-slider-row">
                        <input type="range" id="wbap-tiagang-context-rounds" min="0" max="10" value="5" step="1">
                        <span id="wbap-tiagang-context-rounds-value">5</span>
                    </div>
                    <small class="wbap-text-muted">\u6bcf\u7ea7\u5305\u542b 1 \u6761\u7528\u6237\u6d88\u606f + 1 \u6761\u56de\u590d\uff0c0 = \u4e0d\u8bfb\u53d6\u4e0a\u4e0b\u6587\u3002</small>
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">API \u914d\u7f6e</span>
                </div>
                <div class="wbap-form-group">
                    <label>API 接入渠道</label>
                    <select id="wbap-tiagang-channel">
                        <option value="direct">直连（浏览器）</option>
                        <option value="st-backend">SillyTavern 后端</option>
                    </select>
                    <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">
                        使用后端可提升稳定性与并发吞吐；直连则由浏览器直接访问。
                    </div>
                </div>
                <div class="wbap-form-group wbap-tiagang-backend-only" style="display:none;">
                    <label>后端类型（chat_completion_source）</label>
                    <input type="text" id="wbap-tiagang-provider" list="wbap-tiagang-provider-list" placeholder="openai">
                    <datalist id="wbap-tiagang-provider-list">
                        <option value="openai">OpenAI</option>
                        <option value="claude">Claude</option>
                        <option value="google">Google</option>
                        <option value="mistral">Mistral</option>
                        <option value="cohere">Cohere</option>
                        <option value="openrouter">OpenRouter</option>
                    </datalist>
                    <small class="wbap-text-muted">指定 SillyTavern 后端使用的 API 提供商类型</small>
                </div>
                <div class="wbap-form-group">
                    <label>\u5929\u7eb2 API URL</label>
                    <input type="text" id="wbap-tiagang-api-url" placeholder="https://api.example.com/v1">
                </div>
                <div class="wbap-form-group">
                    <label>\u5929\u7eb2 API Key</label>
                    <input type="password" id="wbap-tiagang-api-key" placeholder="sk-...">
                </div>
                <div class="wbap-form-group">
                    <label>\u5929\u7eb2\u6a21\u578b</label>
                    <div class="wbap-input-group">
                        <select id="wbap-tiagang-model"></select>
                        <button id="wbap-tiagang-fetch-models" class="wbap-btn wbap-btn-secondary">\u83b7\u53d6\u6a21\u578b</button>
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>最大令牌数</label>
                        <input type="number" id="wbap-tiagang-max-tokens" min="0" value="2000">
                    </div>
                    <div class="wbap-form-group">
                        <label>温度</label>
                        <input type="number" id="wbap-tiagang-temperature" min="0" max="2" step="0.1" value="0.7">
                    </div>
                    <div class="wbap-form-group">
                        <label>超时时间 (秒)</label>
                        <input type="number" id="wbap-tiagang-timeout" min="0" value="60">
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>最大重试次数</label>
                        <input type="number" id="wbap-tiagang-max-retries" min="0" value="2">
                    </div>
                    <div class="wbap-form-group">
                        <label>重试延迟 (毫秒)</label>
                        <input type="number" id="wbap-tiagang-retry-delay" min="0" value="800">
                    </div>
                    <div class="wbap-form-group">
                        <label>流式输出</label>
                        <label style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                            <input type="checkbox" id="wbap-tiagang-streaming" checked>
                            启用
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <div class="wbap-settings-footer">
            <button id="wbap-tiagang-save" class="wbap-btn wbap-btn-primary" style="width: 100%;">
                <i class="fa-solid fa-check"></i> \u4fdd\u5b58\u8bbe\u7f6e
            </button>
        </div>
    </div>
</div>`;

    // 正文优化独立设置面板
    const RESPONSE_OPT_SETTINGS_HTML = `
<div id="wbap-resp-opt-settings" class="wbap-settings">
    <div class="wbap-settings-container">
        <div class="wbap-settings-header">
            <h3>正文优化</h3>
            <button id="wbap-resp-opt-close" class="wbap-btn wbap-btn-icon">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        <div class="wbap-settings-content">
            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">正文优化模块</span>
                </div>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-resp-opt-enabled">
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">启用正文优化</span>
                </label>
                <div class="wbap-text-muted" style="font-size: 12px; margin-top: 8px;">
                    拦截 AI 返回的正文内容，通过 LLM 优化后再显示给用户。
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">触发方式</span>
                </div>
                <label class="wbap-switch-label">
                    <input type="checkbox" id="wbap-resp-opt-auto-intercept" checked>
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">自动拦截 AI 回复</span>
                </label>
                <label class="wbap-switch-label" style="margin-top: 8px;">
                    <input type="checkbox" id="wbap-resp-opt-manual-trigger" checked>
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">显示手动触发按钮</span>
                </label>
                <label class="wbap-switch-label" style="margin-top: 8px;">
                    <input type="checkbox" id="wbap-resp-opt-show-fab" checked>
                    <span class="wbap-switch-slider"></span>
                    <span class="wbap-switch-text">显示悬浮球</span>
                </label>
                <div class="wbap-form-group" style="margin-top: 12px;">
                    <label>流式处理模式</label>
                    <select id="wbap-resp-opt-streaming-mode" class="wbap-preset-select">
                        <option value="wait">等待完成后优化</option>
                        <option value="realtime">实时流式优化（实验性）</option>
                    </select>
                    <small class="wbap-text-muted">"等待完成"：AI 回复完整后再优化；"实时流式"：边接收边优化</small>
                </div>
                <div class="wbap-form-group">
                    <label>最小内容长度</label>
                    <input type="number" id="wbap-resp-opt-min-length" min="0" max="1000" value="50" style="width: 140px;">
                    <small class="wbap-text-muted">低于此字符数的消息不会被优化</small>
                </div>
                <div class="wbap-form-group">
                    <label>目标标签（可选）</label>
                    <input type="text" id="wbap-resp-opt-target-tag" placeholder="例如：content" style="width: 200px;">
                    <small class="wbap-text-muted">只优化指定标签内的内容，如 &lt;content&gt;...&lt;/content&gt;。留空则优化整个消息。</small>
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">世界书与条目</span>
                </div>
                <div class="wbap-form-group">
                    <label>选择世界书（可多选）</label>
                    <div class="wbap-input-group" style="gap: 8px; flex-wrap: wrap;">
                        <select id="wbap-resp-opt-worldbook-select"></select>
                        <button id="wbap-resp-opt-worldbook-add" class="wbap-btn wbap-btn-secondary wbap-btn-xs">添加</button>
                    </div>
                    <div id="wbap-resp-opt-selected-worldbooks" class="wbap-tag-list" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;"></div>
                </div>

                <div class="wbap-form-group" style="flex: 1; display: flex; gap: 12px; overflow: hidden;">
                    <div id="wbap-resp-opt-worldbook-list-column" style="width: 150px; border: 1px solid var(--wbap-border, #444); border-radius: 4px; overflow-y: auto; background: var(--wbap-bg-secondary);">
                        <div id="wbap-resp-opt-book-list-container" class="wbap-book-list-container">
                            <p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">请先添加世界书</p>
                        </div>
                    </div>

                    <div id="wbap-resp-opt-entry-list-column" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                            <label style="margin: 0;">选择条目</label>
                            <div style="display: flex; gap: 6px;">
                                <button id="wbap-resp-opt-entries-select-all" class="wbap-btn wbap-btn-secondary wbap-btn-xs">全选</button>
                                <button id="wbap-resp-opt-entries-clear" class="wbap-btn wbap-btn-secondary wbap-btn-xs">取消全选</button>
                            </div>
                        </div>
                        <div id="wbap-resp-opt-entry-list" style="overflow-y: auto; border: 1px solid var(--wbap-border, #444); padding: 8px; border-radius: 4px; flex: 1;">
                            <p class="wbap-text-muted" style="text-align: center; font-size: 12px;">请从左侧选择一本世界书</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">提示词预设</span>
                </div>
                <div class="wbap-form-group">
                    <select id="wbap-resp-opt-prompt-select" class="wbap-preset-select"></select>
                </div>
                <div id="wbap-resp-opt-prompt-desc" class="wbap-prompt-description"></div>
                <div class="wbap-prompt-actions-toolbar">
                    <button id="wbap-resp-opt-prompt-new-btn" class="wbap-btn wbap-btn-xs" title="新建"><i class="fa-solid fa-plus"></i> 新建</button>
                    <button id="wbap-resp-opt-prompt-import-btn" class="wbap-btn wbap-btn-xs" title="导入"><i class="fa-solid fa-download"></i> 导入</button>
                    <button id="wbap-resp-opt-prompt-edit-btn" class="wbap-btn wbap-btn-xs" title="编辑"><i class="fa-solid fa-pencil"></i> 编辑</button>
                    <button id="wbap-resp-opt-prompt-export-btn" class="wbap-btn wbap-btn-xs" title="导出"><i class="fa-solid fa-upload"></i> 导出</button>
                    <button id="wbap-resp-opt-prompt-delete-btn" class="wbap-btn wbap-btn-xs wbap-btn-danger" title="删除"><i class="fa-solid fa-trash"></i> 删除</button>
                </div>
                <input type="file" id="wbap-resp-opt-prompt-file-input" accept=".json" class="wbap-hidden">
            </div>

            <div class="wbap-section">
                <div class="wbap-section-header">
                    <span class="wbap-section-title">API 配置</span>
                </div>
                <div class="wbap-form-group">
                    <label>API 接入渠道</label>
                    <select id="wbap-resp-opt-channel">
                        <option value="direct">直连（浏览器）</option>
                        <option value="st-backend">SillyTavern 后端</option>
                    </select>
                </div>
                <div class="wbap-form-group">
                    <label>API URL</label>
                    <input type="text" id="wbap-resp-opt-api-url" placeholder="https://api.example.com/v1">
                </div>
                <div class="wbap-form-group">
                    <label>API Key</label>
                    <input type="password" id="wbap-resp-opt-api-key" placeholder="sk-...">
                </div>
                <div class="wbap-form-group">
                    <label>模型</label>
                    <div class="wbap-input-group">
                        <select id="wbap-resp-opt-model"></select>
                        <button id="wbap-resp-opt-fetch-models" class="wbap-btn wbap-btn-secondary">获取模型</button>
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>最大令牌数</label>
                        <input type="number" id="wbap-resp-opt-max-tokens" min="0" value="4000">
                    </div>
                    <div class="wbap-form-group">
                        <label>温度</label>
                        <input type="number" id="wbap-resp-opt-temperature" min="0" max="2" step="0.1" value="0.7">
                    </div>
                    <div class="wbap-form-group">
                        <label>超时时间 (秒)</label>
                        <input type="number" id="wbap-resp-opt-timeout" min="0" value="60">
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>最大重试次数</label>
                        <input type="number" id="wbap-resp-opt-max-retries" min="0" value="2">
                    </div>
                    <div class="wbap-form-group">
                        <label>重试延迟 (毫秒)</label>
                        <input type="number" id="wbap-resp-opt-retry-delay" min="0" value="800">
                    </div>
                    <div class="wbap-form-group">
                        <label>流式输出</label>
                        <label style="display:flex; align-items:center; gap:6px; margin-top:6px;">
                            <input type="checkbox" id="wbap-resp-opt-streaming" checked>
                            启用
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <div class="wbap-settings-footer">
            <button id="wbap-resp-opt-save" class="wbap-btn wbap-btn-primary" style="width: 100%;">
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
                    <label>API 接入渠道</label>
                    <select id="wbap-endpoint-edit-channel">
                        <option value="direct">直连（浏览器）</option>
                        <option value="st-backend">SillyTavern 后端</option>
                    </select>
                    <div class="wbap-text-muted" style="font-size:12px; margin-top:6px;">
                        使用后端可提升稳定性与并发吞吐；直连则由浏览器直接访问。
                    </div>
                </div>
                <div class="wbap-form-group wbap-endpoint-backend-only" style="display:none;">
                    <label>后端类型（chat_completion_source）</label>
                    <input type="text" id="wbap-endpoint-edit-provider" list="wbap-endpoint-provider-list" placeholder="openai">
                    <datalist id="wbap-endpoint-provider-list">
                        <option value="openai"></option>
                        <option value="openai_test"></option>
                        <option value="anthropic"></option>
                        <option value="google"></option>
                        <option value="mistral"></option>
                    </datalist>
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
                        <label>最大令牌数</label>
                        <input type="number" id="wbap-endpoint-edit-max-tokens" value="2000">
                    </div>
                    <div class="wbap-form-group">
                        <label>温度</label>
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
                        <label>存在惩罚</label>
                        <input type="number" id="wbap-endpoint-edit-presence-penalty" min="-2" max="2" step="0.1" value="0">
                    </div>
                </div>
                <div class="wbap-form-row">
                    <div class="wbap-form-group">
                        <label>频率惩罚</label>
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
        <!-- 头部区域 -->
        <div class="wbap-progress-header">
            <div class="wbap-progress-title-row">
                <h4 id="wbap-progress-title">正在处理...</h4>
                <div class="wbap-progress-stats">
                    <span id="wbap-progress-task-count" class="wbap-progress-task-count">0/0</span>
                </div>
            </div>
            <div class="wbap-progress-header-actions">
                <button id="wbap-progress-cancel-all" class="wbap-progress-cancel-btn" title="取消全部任务">
                    <i class="fa-solid fa-stop"></i>
                    <span>取消全部</span>
                </button>
                <div class="wbap-progress-main-timer">
                    <i class="fa-regular fa-clock"></i>
                    <span id="wbap-progress-timer">0.000s</span>
                </div>
            </div>
        </div>
        
        <!-- 总进度条 -->
        <div class="wbap-progress-bar-container wbap-progress-main-bar">
            <div id="wbap-progress-bar" class="wbap-progress-bar animated">
                <div class="wbap-progress-glow"></div>
                <div class="wbap-progress-shimmer"></div>
            </div>
        </div>
        <div class="wbap-progress-summary">
            <span id="wbap-progress-status">准备中...</span>
            <span id="wbap-progress-percent">0%</span>
        </div>

        <!-- 任务实例列表区域 -->
        <div id="wbap-progress-tasks" class="wbap-progress-tasks">
            <!-- 动态添加的任务卡片 -->
        </div>
    </div>
    <div class="wbap-resize-handle wbap-resize-nw" data-direction="nw"></div>
    <div class="wbap-resize-handle wbap-resize-ne" data-direction="ne"></div>
    <div class="wbap-resize-handle wbap-resize-sw" data-direction="sw"></div>
    <div class="wbap-resize-handle wbap-resize-se" data-direction="se" id="wbap-progress-resize-handle"></div>
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
    const CABINET_PANEL_HTML = `
<div id="wbap-cabinet-panel" class="wbap-opt-panel-root">
    <div class="wbap-opt-container">
        <div class="wbap-opt-header">
            <div class="wbap-opt-title-group">
                <div class="wbap-opt-title">内阁</div>
                <div class="wbap-opt-subtitle">超级并发讨论</div>
            </div>
            <div class="wbap-opt-actions">
                <button id="wbap-cabinet-close" class="wbap-opt-icon-btn" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
        <div class="wbap-opt-body">
            <div id="wbap-cabinet-chat" class="wbap-opt-chat-stream"></div>
        </div>
        <div class="wbap-opt-footer">
            <div class="wbap-opt-toolbar" style="justify-content: space-between;">
                <div class="wbap-opt-chip">宰相：<span id="wbap-cabinet-chancellor-label">未设置</span></div>
                <div class="wbap-opt-chip">大学士：<span id="wbap-cabinet-scholar-count">0</span></div>
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
    // 正文优化提示词编辑面板
    const RESPONSE_OPT_PROMPT_EDITOR_HTML = `
<div id="wbap-resp-opt-prompt-editor" class="wbap-level3-editor wbap-hidden">
    <div class="wbap-level3-editor-overlay"></div>
    <div class="wbap-level3-editor-container">
        <div class="wbap-level3-editor-header">
            <span class="wbap-level3-editor-title">正文优化提示词编辑</span>
            <button id="wbap-resp-opt-editor-close" class="wbap-opt-icon-btn" type="button">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="wbap-level3-editor-body">
            <div class="wbap-level3-field">
                <label for="wbap-resp-opt-prompt-name">预设名称</label>
                <input id="wbap-resp-opt-prompt-name" class="wbap-level3-input" type="text" placeholder="例如：默认正文优化提示词">
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-resp-opt-prompt-desc-edit">预设描述</label>
                <textarea id="wbap-resp-opt-prompt-desc-edit" class="wbap-level3-textarea" rows="2" placeholder="简要说明用途..."></textarea>
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-resp-opt-system-prompt">系统提示词</label>
                <textarea id="wbap-resp-opt-system-prompt" class="wbap-level3-textarea" rows="8" placeholder="定义AI的角色和行为规则..."></textarea>
            </div>
            <div class="wbap-level3-field">
                <label for="wbap-resp-opt-prompt-template">优化提示词模板</label>
                <textarea id="wbap-resp-opt-prompt-template" class="wbap-level3-textarea" rows="8" placeholder="使用 {content} 代表待优化内容..."></textarea>
                <div class="wbap-level3-hint">
                    可用变量：<code>{content}</code> - 待优化的正文内容，<code>{context}</code> - 对话上下文，<code>{sulv1-4}</code> - 自定义变量
                </div>
            </div>
            <div class="wbap-level3-field">
                <label>自定义变量（可选）</label>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                    <input id="wbap-resp-opt-var-sulv1" class="wbap-level3-input" type="text" placeholder="sulv1">
                    <input id="wbap-resp-opt-var-sulv2" class="wbap-level3-input" type="text" placeholder="sulv2">
                    <input id="wbap-resp-opt-var-sulv3" class="wbap-level3-input" type="text" placeholder="sulv3">
                    <input id="wbap-resp-opt-var-sulv4" class="wbap-level3-input" type="text" placeholder="sulv4">
                </div>
            </div>
        </div>
        <div class="wbap-level3-editor-footer">
            <button id="wbap-resp-opt-editor-reset" class="wbap-level3-btn-secondary" type="button">
                <i class="fa-solid fa-rotate-left"></i> 恢复默认
            </button>
            <button id="wbap-resp-opt-editor-save" class="wbap-level3-btn-primary" type="button">
                <i class="fa-solid fa-save"></i> 保存
            </button>
        </div>
    </div>
</div>
`;

    // 正文优化助手面板
    const RESP_OPT_ASSISTANT_PANEL_HTML = `
<div id="wbap-resp-opt-assistant" class="wbap-opt-panel-root wbap-hidden">
    <div class="wbap-opt-container">
        <!-- 头部 -->
        <div class="wbap-opt-header">
            <div class="wbap-opt-title-group">
                <div class="wbap-opt-title">正文优化助手</div>
                <div class="wbap-opt-subtitle">Response Optimization Assistant</div>
            </div>
            <div class="wbap-opt-actions">
                <button id="wbap-roa-diff-toggle" class="wbap-opt-icon-btn" title="查看差异对比">
                    <i class="fa-solid fa-code-compare"></i>
                </button>
                <button id="wbap-roa-original-toggle" class="wbap-opt-icon-btn" title="查看原文">
                    <i class="fa-regular fa-file-lines"></i>
                </button>
                <button id="wbap-roa-close" class="wbap-opt-icon-btn" title="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>

        <!-- 主体 -->
        <div class="wbap-opt-body">
            <!-- 对话区域 -->
            <div id="wbap-roa-chat" class="wbap-opt-chat-stream"></div>

            <!-- 差异对比预览区域 -->
            <div id="wbap-roa-diff-panel" class="wbap-opt-preview-overlay">
                <div class="wbap-opt-preview-header">
                    <span>差异对比</span>
                    <div class="wbap-diff-legend">
                        <span class="wbap-diff-legend-item wbap-diff-legend-delete"><i class="fa-solid fa-minus"></i> 原文删除</span>
                        <span class="wbap-diff-legend-item wbap-diff-legend-insert"><i class="fa-solid fa-plus"></i> 新增内容</span>
                    </div>
                    <button id="wbap-roa-diff-close" class="wbap-opt-icon-btn" title="关闭">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="wbap-opt-preview-body">
                    <div id="wbap-roa-diff-container" class="wbap-diff-view"></div>
                </div>
            </div>

            <!-- 原文预览区域 -->
            <div id="wbap-roa-original-panel" class="wbap-opt-preview-overlay">
                <div class="wbap-opt-preview-header">
                    <span>优化前原文</span>
                    <button id="wbap-roa-original-close" class="wbap-opt-icon-btn" title="关闭">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="wbap-opt-preview-body">
                    <textarea id="wbap-roa-original-text" class="wbap-opt-textarea" readonly></textarea>
                </div>
            </div>
        </div>

        <!-- 底部 -->
        <div class="wbap-opt-footer">
            <!-- 信息栏 -->
            <div class="wbap-roa-info-bar">
                <span id="wbap-roa-memory-count">记忆: 0/10 轮</span>
                <button id="wbap-roa-clear-memory" class="wbap-opt-mini-btn" type="button">清空记忆</button>
            </div>

            <!-- 输入区域 -->
            <div class="wbap-opt-input-row">
                <textarea id="wbap-roa-input" class="wbap-opt-input" rows="1" placeholder="询问模型为什么这样优化..."></textarea>
                <button id="wbap-roa-send" class="wbap-opt-send-btn" title="发送">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>

            <!-- 操作栏 -->
            <div class="wbap-roa-actions">
                <button class="wbap-opt-level3-btn wbap-opt-level3-skip" id="wbap-roa-revert" type="button">
                    <i class="fa-solid fa-rotate-left"></i>
                    <span>恢复原文</span>
                </button>
                <button class="wbap-opt-level3-btn wbap-opt-level3-confirm" id="wbap-roa-accept" type="button">
                    <i class="fa-solid fa-check"></i>
                    <span>接受优化</span>
                </button>
            </div>
        </div>
    </div>
</div>
`;

    const TABLE_MANAGER_HTML = `
<div id="wbap-table-manager" class="wbap-settings">
    <div class="wbap-settings-container">
        <!-- 顶部 Header -->
        <div class="wbap-settings-header">
            <div class="wbap-header-title-group">
                <div class="wbap-header-icon">
                    <i class="fa-solid fa-table-cells"></i>
                </div>
                <div class="wbap-header-text">
                    <h3>状态管理</h3>
                    <span class="wbap-header-subtitle">State Manager</span>
                </div>
            </div>
            <button id="wbap-table-manager-close" class="wbap-btn wbap-btn-icon wbap-close-btn">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>
        
        <div class="wbap-settings-body">
            <!-- 水平导航标签 -->
            <div class="wbap-table-nav-tabs">
                <div class="wbap-table-nav-tab active" data-nav="overview">
                    <i class="fa-solid fa-eye"></i>
                    <span>总览</span>
                </div>
                <div class="wbap-table-nav-tab" data-nav="setup">
                    <i class="fa-solid fa-sliders"></i>
                    <span>全局设置</span>
                </div>
                <div class="wbap-table-nav-tab" data-nav="operation">
                    <i class="fa-solid fa-table"></i>
                    <span>表格编辑</span>
                </div>
                <div class="wbap-table-nav-tab" data-nav="prompt">
                    <i class="fa-solid fa-terminal"></i>
                    <span>提示词</span>
                </div>
                <div class="wbap-table-nav-tab" data-nav="lorebook">
                    <i class="fa-solid fa-book-atlas"></i>
                    <span>世界书</span>
                </div>
            </div>
            
            <!-- 设置内容区域 -->
            <div id="wbap-table-nav-content" class="wbap-table-nav-content">
                <!-- ========== 表格总览 ========== -->
                <div class="wbap-table-nav-panel active" data-panel="overview">
                    <div id="wbap-table-overview" style="padding:8px;overflow-y:auto;"></div>
                </div>

                <!-- ========== 全局设置 ========== -->
                <div class="wbap-table-nav-panel" data-panel="setup">
                    <!-- 模块开关 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-power-off"></i>
                            <span>模块控制</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-summary-input-row">
                                <div class="wbap-summary-input-group">
                                    <label>启用表格展示模块</label>
                                    <label class="wbap-toggle-switch">
                                        <input type="checkbox" id="wbap-table-module-enabled">
                                        <span class="wbap-toggle-slider"></span>
                                    </label>
                                    <div class="wbap-summary-hint">禁用后停止数据提取和渲染，已有数据保留</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 显示设置 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-display"></i>
                            <span>显示设置</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-summary-input-row">
                                <div class="wbap-summary-input-group">
                                    <label>聊天内显示表格</label>
                                    <label class="wbap-toggle-switch">
                                        <input type="checkbox" id="wbap-table-show-in-chat">
                                        <span class="wbap-toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="wbap-summary-input-group">
                                    <label>仅渲染最新消息</label>
                                    <label class="wbap-toggle-switch">
                                        <input type="checkbox" id="wbap-table-render-latest" checked>
                                        <span class="wbap-toggle-slider"></span>
                                    </label>
                                    <div class="wbap-summary-hint">避免污染历史消息</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 标签提取设置 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-tags"></i>
                            <span>标签提取</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-summary-input-group wbap-summary-full-width">
                                <label>内容标签名称</label>
                                <input type="text" id="wbap-table-extract-tag" class="wbap-summary-input" placeholder="content" style="width:200px;">
                                <div class="wbap-summary-hint">用于提取 AI 回复正文的标签名（默认 content）</div>
                            </div>
                            <div class="wbap-summary-input-group wbap-summary-full-width">
                                <label>编辑指令标签名称</label>
                                <input type="text" id="wbap-table-edit-tag" class="wbap-summary-input" placeholder="Amily2Edit" style="width:200px;">
                                <div class="wbap-summary-hint">用于提取 AI 回复中填表指令的标签名（默认 Amily2Edit）</div>
                            </div>
                        </div>
                    </div>

                    <!-- API 设置 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-server"></i>
                            <span>填表 API</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-summary-input-group wbap-summary-full-width">
                                <label>API 来源</label>
                                <select id="wbap-table-api-source" class="wbap-summary-input">
                                    <option value="st_backend">SillyTavern 后端 (推荐)</option>
                                    <option value="direct">浏览器直连</option>
                                </select>
                            </div>
                            
                            <!-- 直连配置区 -->
                            <div id="wbap-table-api-direct-config" style="display:none;">
                                <div class="wbap-summary-input-group wbap-summary-full-width">
                                    <label>API URL</label>
                                    <input type="text" id="wbap-table-api-url" class="wbap-summary-input" placeholder="https://api.openai.com/v1">
                                </div>
                                <div class="wbap-summary-input-group wbap-summary-full-width">
                                    <label>API Key</label>
                                    <input type="password" id="wbap-table-api-key" class="wbap-summary-input" placeholder="sk-...">
                                </div>
                            </div>

                            <div class="wbap-summary-input-group wbap-summary-full-width">
                                <label>模型名称</label>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <input type="text" id="wbap-table-api-model" class="wbap-summary-input" style="flex:1;" placeholder="gpt-4o">
                                    <button id="wbap-table-fetch-models" class="wbap-btn wbap-btn-xs" title="获取模型列表">
                                        <i class="fa-solid fa-rotate"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 预设管理 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-box-archive"></i>
                            <span>预设管理</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                <button id="wbap-table-import-btn" class="wbap-btn wbap-btn-xs">
                                    <i class="fa-solid fa-download"></i> 导入预设
                                </button>
                                <button id="wbap-table-export-btn" class="wbap-btn wbap-btn-xs">
                                    <i class="fa-solid fa-upload"></i> 导出预设
                                </button>
                                <input type="file" id="wbap-table-file-input" accept=".json" style="display:none;">
                            </div>
                            <div class="wbap-summary-hint" style="margin-top:8px;">
                                <i class="fa-solid fa-info-circle"></i>
                                导入/导出包含所有表格数据及提示词配置
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- ========== 表格编辑 ========== -->
                <div class="wbap-table-nav-panel" data-panel="operation">
                    <!-- 表格列表 -->
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-table-list"></i>
                            <span>表格列表</span>
                            <div style="flex:1;"></div>
                            <button id="wbap-table-tpl-import-btn" class="wbap-btn wbap-btn-xs">
                                <i class="fa-solid fa-download"></i> 导入预设
                            </button>
                            <input type="file" id="wbap-table-tpl-file-input" accept=".json" style="display:none;">
                        </div>
                        <div class="wbap-summary-section-body" style="padding:0;">
                            <div id="wbap-table-list" style="max-height:50vh;overflow-y:auto;padding:8px;">
                                <p class="wbap-text-muted" style="text-align:center;font-size:12px;">暂无表格</p>
                            </div>
                        </div>
                    </div>

                    <!-- 表格数据编辑区 -->
                    <div class="wbap-summary-section" style="flex:1;">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-pen-to-square"></i>
                            <span id="wbap-table-edit-title">表格数据</span>
                            <div style="flex:1;"></div>
                            <button id="wbap-table-add-row-btn" class="wbap-btn wbap-btn-xs" style="display:none;">
                                <i class="fa-solid fa-plus"></i> 添加行
                            </button>
                        </div>
                        <div class="wbap-summary-section-body" style="padding:0;">
                            <div id="wbap-table-grid-area" class="wbap-table-grid-area" style="max-height:40vh;overflow:auto;">
                                <p class="wbap-text-muted" style="text-align:center;font-size:12px;padding:16px;">请从上方选择一个表格</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- ========== 提示词 ========== -->
                <div class="wbap-table-nav-panel" data-panel="prompt">
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-terminal"></i>
                            <span>提示词模板</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-prompt-tabs" style="display:flex; gap:8px; margin-bottom:12px;">
                                <button class="wbap-sub-tab active" data-sub="batch">批量填表</button>
                                <button class="wbap-sub-tab" data-sub="single">单次填表</button>
                                <button class="wbap-sub-tab" data-sub="reorg">重整理</button>
                            </div>
                            <textarea id="wbap-table-prompt-editor" class="wbap-summary-textarea" rows="12" style="font-family:monospace;"></textarea>
                            <div class="wbap-prompt-vars-hint" style="margin-top:8px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:12px; color:var(--wbap-text-muted,#94a3b8);">
                                <span style="display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-info-circle"></i> 可用变量:</span>
                                <span class="wbap-var-tag">{chat_history}</span>
                                <span class="wbap-var-tag">{current_table}</span>
                                <span class="wbap-var-tag">{user_name}</span>
                                <span class="wbap-var-tag">{char_name}</span>
                            </div>
                            <button id="wbap-save-prompt" class="wbap-btn wbap-btn-primary" style="margin-top:12px; width:100%;">
                                <i class="fa-solid fa-save"></i> 保存提示词
                            </button>
                            <div style="margin-top:16px; border-top:1px solid var(--SmartThemeBorderColor,#555); padding-top:12px;">
                                <div style="font-size:12px; color:var(--wbap-text-muted,#94a3b8); margin-bottom:8px;">
                                    <i class="fa-solid fa-play-circle"></i> 执行填表（调用 AI 分析聊天记录并更新表格）
                                </div>
                                <div style="display:flex; gap:8px;">
                                    <button id="wbap-exec-batch" class="wbap-btn" style="flex:1;" title="批量填表：一次性分析所有聊天记录并更新全部表格">
                                        <i class="fa-solid fa-bolt"></i> 批量填表
                                    </button>
                                    <button id="wbap-exec-single" class="wbap-btn" style="flex:1;" title="分步填表：逐步分析并更新表格">
                                        <i class="fa-solid fa-shoe-prints"></i> 分步填表
                                    </button>
                                    <button id="wbap-exec-reorg" class="wbap-btn" style="flex:1;" title="重整理：清理冗余数据、压缩历史">
                                        <i class="fa-solid fa-broom"></i> 重整理
                                    </button>
                                </div>
                                <div id="wbap-fill-status" style="margin-top:8px; font-size:12px; color:var(--wbap-text-muted,#94a3b8); display:none;"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- ========== 世界书 ========== -->
                <div class="wbap-table-nav-panel" data-panel="lorebook">
                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-book-atlas"></i>
                            <span>世界书同步</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <div class="wbap-summary-input-group wbap-summary-full-width">
                                <label>目标世界书</label>
                                <select id="wbap-table-target-worldbook" class="wbap-summary-input">
                                    <option value="">自动创建 WBAP_Tables</option>
                                </select>
                            </div>
                            <div class="wbap-summary-input-row" style="margin-top:12px;">
                                <div class="wbap-summary-input-group">
                                    <label>自动同步</label>
                                    <label class="wbap-toggle-switch">
                                        <input type="checkbox" id="wbap-table-auto-sync" checked>
                                        <span class="wbap-toggle-slider"></span>
                                    </label>
                                    <div class="wbap-summary-hint">表格变更时自动更新世界书</div>
                                </div>
                            </div>
                            <button id="wbap-table-sync-now" class="wbap-btn wbap-btn-primary" style="width:100%; margin-top:16px;">
                                <i class="fa-solid fa-arrows-rotate"></i> 立即同步
                            </button>
                        </div>
                    </div>

                    <div class="wbap-summary-section">
                        <div class="wbap-summary-section-header">
                            <i class="fa-solid fa-code"></i>
                            <span>索引模板</span>
                        </div>
                        <div class="wbap-summary-section-body">
                            <textarea id="wbap-table-index-template" class="wbap-summary-textarea" rows="4" placeholder="使用 {table_name} 和 {table_content} 变量..."></textarea>
                            <div class="wbap-summary-hint" style="margin-top:8px;">
                                <i class="fa-solid fa-info-circle"></i>
                                定义表格同步到世界书时的格式模板
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 底部表格标签栏 -->
            <div id="wbap-table-tabs-bar" class="wbap-table-tabs-bar">
                <!-- 表格标签将动态渲染 -->
            </div>
        </div>
    </div>
</div>`;


    // 将模板缓存到全局命名空间
    window.WBAP.UI_TEMPLATES = {
        PANEL_HTML,
        PROMPT_EDITOR_HTML,
        SETTINGS_HTML,
        TIANGANG_SETTINGS_HTML,
        RESPONSE_OPT_SETTINGS_HTML,
        SUPER_MEMORY_SETTINGS_HTML,
        API_ENDPOINT_EDITOR_HTML,
        PROMPT_PICKER_HTML,
        PROGRESS_PANEL_HTML,
        OPTIMIZATION_PANEL_HTML,
        CABINET_PANEL_HTML,
        LEVEL3_PROMPT_EDITOR_HTML,
        RESPONSE_OPT_PROMPT_EDITOR_HTML,
        RESP_OPT_ASSISTANT_PANEL_HTML,
        SUMMARY_PANEL_HTML,
        TABLE_MANAGER_HTML
    };

})();
