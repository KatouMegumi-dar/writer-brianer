/**
 * 知识图谱可视化 (Graph View) - 多维树状图版本
 * 支持：水平树状布局、拖拽平移、缩放、节点详情、多维边可视化
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};

    class GraphViewer {
        constructor() {
            this.container = null;
            this.canvas = null;
            this.ctx = null;
            this.nodes = [];
            this.links = [];
            this.active = false;
            this.transform = { x: 100, y: 0, k: 1 };
            this.dragging = null;
            this.hoveredNode = null;
            this.selectedNode = null;
            this.searchQuery = '';
            this.showLabels = true;
            this.stats = null;
            this.panning = false;
            this.panStart = null;
            // 多维可视化
            this.activeDimensions = new Set(['temporal', 'spatial', 'emotional', 'causal', 'character', 'thematic']);
            this.dimensionFilter = null;
            this.isMultiDim = false;
        }

        show(nodes, links, stats = null) {
            if (this.active) return;
            this.active = true;
            this.stats = stats;

            this.nodes = nodes.map(n => ({ ...n }));
            this.links = links.map(l => ({ ...l }));

            // 检测是否为多维图谱
            this.isMultiDim = this.links.some(l => l.dimensions && l.dimensions.length > 0);

            // 解析链接引用
            const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
            this.links.forEach(l => {
                l.sourceNode = nodeMap.get(l.source);
                l.targetNode = nodeMap.get(l.target);
            });
            this.links = this.links.filter(l => l.sourceNode && l.targetNode);

            // 计算树状布局
            this.calculateTreeLayout();

            // 重置变换
            this.transform = { x: 100, y: window.innerHeight / 2 - 50, k: 1 };

            this.createOverlay();
            this.draw();
        }

        calculateTreeLayout() {
            // 1. 构建邻接表
            const adjacency = new Map();
            const inDegree = new Map();

            this.nodes.forEach(n => {
                adjacency.set(n.id, []);
                inDegree.set(n.id, 0);
            });

            this.links.forEach(l => {
                adjacency.get(l.source).push(l.target);
                inDegree.set(l.target, (inDegree.get(l.target) || 0) + 1);
            });

            // 2. 找到根节点（入度为0或最小的节点）
            const roots = [];
            const visited = new Set();

            // 按入度排序，入度为0的是根
            const sortedNodes = [...this.nodes].sort((a, b) =>
                (inDegree.get(a.id) || 0) - (inDegree.get(b.id) || 0)
            );

            // 如果没有入度为0的节点，选择入度最小的作为根
            if (inDegree.get(sortedNodes[0]?.id) > 0) {
                roots.push(sortedNodes[0]?.id);
            } else {
                sortedNodes.forEach(n => {
                    if (inDegree.get(n.id) === 0) {
                        roots.push(n.id);
                    }
                });
            }

            // 如果还是没有根，使用第一个节点
            if (roots.length === 0 && this.nodes.length > 0) {
                roots.push(this.nodes[0].id);
            }

            // 3. BFS 计算层级
            const levels = new Map();
            const queue = [];

            roots.forEach(rootId => {
                if (!visited.has(rootId)) {
                    queue.push({ id: rootId, level: 0 });
                    visited.add(rootId);
                }
            });

            while (queue.length > 0) {
                const { id, level } = queue.shift();
                levels.set(id, level);

                const children = adjacency.get(id) || [];
                children.forEach(childId => {
                    if (!visited.has(childId)) {
                        visited.add(childId);
                        queue.push({ id: childId, level: level + 1 });
                    }
                });
            }

            // 处理未访问的节点（孤立节点或循环中的节点）
            this.nodes.forEach(n => {
                if (!visited.has(n.id)) {
                    const maxLevel = Math.max(...levels.values(), 0);
                    levels.set(n.id, maxLevel + 1);
                }
            });

            // 4. 按层级分组
            const levelGroups = new Map();
            levels.forEach((level, nodeId) => {
                if (!levelGroups.has(level)) {
                    levelGroups.set(level, []);
                }
                levelGroups.get(level).push(nodeId);
            });

            // 5. 计算位置
            const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
            const levelWidth = 250;  // 层级间距
            const nodeHeight = 60;   // 节点间距

            levelGroups.forEach((nodeIds, level) => {
                const totalHeight = nodeIds.length * nodeHeight;
                const startY = -totalHeight / 2;

                nodeIds.forEach((nodeId, index) => {
                    const node = nodeMap.get(nodeId);
                    if (node) {
                        node.x = level * levelWidth;
                        node.y = startY + index * nodeHeight;
                        node.level = level;
                    }
                });
            });

            // 计算画布尺寸
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            this.nodes.forEach(n => {
                minX = Math.min(minX, n.x);
                maxX = Math.max(maxX, n.x);
                minY = Math.min(minY, n.y);
                maxY = Math.max(maxY, n.y);
            });

            this.graphBounds = {
                minX: minX - 100,
                maxX: maxX + 200,
                minY: minY - 100,
                maxY: maxY + 100
            };
        }

        createOverlay() {
            // 检测移动端 - 更可靠的检测方式
            this.isMobile = window.innerWidth <= 600 ||
                (window.innerWidth <= 768 && 'ontouchstart' in window) ||
                /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            this.container = document.createElement('div');
            this.container.id = 'wbap-graph-container';
            this.container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 9999;
                background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 50%, #16213e 100%);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                touch-action: none;
            `;

            // 顶部工具栏 - 移动端简化
            const toolbar = document.createElement('div');
            const toolbarHeight = this.isMobile ? 44 : 50;
            toolbar.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: ${toolbarHeight}px;
                background: rgba(0,0,0,0.9);
                display: flex;
                align-items: center;
                padding: 0 ${this.isMobile ? '10px' : '20px'};
                gap: ${this.isMobile ? '8px' : '15px'};
                z-index: 10;
            `;

            if (this.isMobile) {
                // 移动端简化工具栏 - 更紧凑
                toolbar.innerHTML = `
                    <span style="color: #88ffcc; font-size: 13px;">🌳</span>
                    <input type="text" id="wbap-graph-search" placeholder="搜索"
                        style="padding: 4px 6px; border-radius: 4px; border: 1px solid #444; background: #1a1a2e; color: #fff; flex: 1; min-width: 50px; max-width: 120px; font-size: 13px;">
                    <button id="wbap-graph-fit" style="padding: 5px 8px; background: #2a2a3a; color: #fff; border: 1px solid #444; border-radius: 4px; font-size: 11px;">适应</button>
                    <button id="wbap-graph-close" style="padding: 5px 10px; background: #ff4444; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 14px;">✕</button>
                `;
            } else {
                // 桌面端完整工具栏（含多维筛选）
                toolbar.innerHTML = `
                    <h3 style="color: #88ffcc; margin: 0; font-size: 16px; white-space: nowrap;">🌳 知识图谱${this.isMultiDim ? ' (多维)' : ''}</h3>
                    <input type="text" id="wbap-graph-search" placeholder="搜索节点..."
                        style="padding: 6px 12px; border-radius: 4px; border: 1px solid #444; background: #1a1a2e; color: #fff; width: 150px;">
                    <label style="color: #aaa; font-size: 12px; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                        <input type="checkbox" id="wbap-graph-labels" checked> 标签
                    </label>
                    ${this.isMultiDim ? this.buildDimensionFilterHTML() : ''}
                    <div style="flex:1"></div>
                    <span id="wbap-graph-stats" style="color: #888; font-size: 12px;"></span>
                    <button id="wbap-graph-fit" style="padding: 6px 12px; background: #2a2a3a; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer;">适应画面</button>
                    <button id="wbap-graph-close" style="padding: 6px 12px; background: #ff4444; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">关闭</button>
                `;
            }
            this.container.appendChild(toolbar);

            // 画布
            this.canvas = document.createElement('canvas');
            this.canvas.style.cssText = `
                position: absolute;
                top: ${toolbarHeight}px;
                left: 0;
                cursor: grab;
                touch-action: none;
            `;
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight - toolbarHeight;
            this.container.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');
            this.toolbarHeight = toolbarHeight;

            // 节点详情面板 - 移动端全宽底部弹出
            const detailPanel = document.createElement('div');
            detailPanel.id = 'wbap-graph-detail';
            if (this.isMobile) {
                detailPanel.style.cssText = `
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    max-height: 50vh;
                    background: rgba(20, 20, 40, 0.98);
                    border-top: 1px solid #444;
                    border-radius: 12px 12px 0 0;
                    padding: 15px;
                    color: #fff;
                    font-size: 13px;
                    display: none;
                    overflow-y: auto;
                    z-index: 20;
                `;
            } else {
                detailPanel.style.cssText = `
                    position: absolute;
                    bottom: 20px;
                    right: 20px;
                    width: 320px;
                    max-height: 400px;
                    background: rgba(20, 20, 40, 0.95);
                    border: 1px solid #444;
                    border-radius: 8px;
                    padding: 15px;
                    color: #fff;
                    font-size: 13px;
                    display: none;
                    overflow-y: auto;
                    z-index: 10;
                `;
            }
            this.container.appendChild(detailPanel);

            // 图例 - 移动端隐藏
            if (!this.isMobile) {
                const legend = document.createElement('div');
                legend.id = 'wbap-graph-legend';
                legend.style.cssText = `
                    position: absolute;
                    bottom: 20px;
                    left: 20px;
                    background: rgba(20, 20, 40, 0.9);
                    border: 1px solid #444;
                    border-radius: 8px;
                    padding: 10px;
                    color: #fff;
                    font-size: 11px;
                    z-index: 10;
                    max-width: 160px;
                `;
                legend.innerHTML = this.buildLegendHTML();
                this.container.appendChild(legend);

                // 迷你地图 - 仅桌面端
                const minimap = document.createElement('canvas');
                minimap.id = 'wbap-graph-minimap';
                minimap.width = 120;
                minimap.height = 80;
                minimap.style.cssText = `
                    position: absolute;
                    top: ${this.toolbarHeight + 10}px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid #444;
                    border-radius: 4px;
                    z-index: 10;
                `;
                this.container.appendChild(minimap);
                this.minimap = minimap;
            }

            document.body.appendChild(this.container);

            // 事件绑定
            this.bindEvents(toolbar, detailPanel);

            // 更新统计（仅桌面端有这个元素）
            if (this.stats) {
                const statsEl = document.getElementById('wbap-graph-stats');
                if (statsEl) {
                    statsEl.textContent = `${this.stats.nodeCount} 节点 | ${this.stats.linkCount} 链接`;
                }
            }
        }

        buildLegendHTML() {
            const types = WBAP.GraphEngine?.NODE_TYPES || {};
            let html = '<div style="font-weight: bold; margin-bottom: 8px;">节点类型</div>';

            for (const [key, type] of Object.entries(types)) {
                html += `<div style="display: flex; align-items: center; gap: 6px; margin: 3px 0;">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${type.color};"></span>
                    <span>${type.icon} ${type.label}</span>
                </div>`;
            }

            // 多维边图例
            if (this.isMultiDim) {
                const EDGE_DIMENSIONS = WBAP.EDGE_DIMENSIONS || {};
                html += '<div style="font-weight: bold; margin: 10px 0 8px 0; border-top: 1px solid #444; padding-top: 8px;">边维度</div>';
                for (const [key, dim] of Object.entries(EDGE_DIMENSIONS)) {
                    html += `<div style="display: flex; align-items: center; gap: 6px; margin: 3px 0;">
                        <span style="display: inline-block; width: 16px; height: 3px; background: ${dim.color};"></span>
                        <span>${dim.icon} ${dim.label}</span>
                    </div>`;
                }
            }

            return html;
        }

        buildDimensionFilterHTML() {
            const EDGE_DIMENSIONS = WBAP.EDGE_DIMENSIONS || {};
            let html = '<div style="display: flex; gap: 5px; align-items: center;">';
            for (const [key, dim] of Object.entries(EDGE_DIMENSIONS)) {
                const checked = this.activeDimensions.has(dim.id) ? 'checked' : '';
                html += `<label style="color: ${dim.color}; font-size: 11px; cursor: pointer;" title="${dim.label}">
                    <input type="checkbox" class="wbap-dim-filter" data-dim="${dim.id}" ${checked} style="display: none;">
                    <span style="opacity: ${checked ? 1 : 0.4};">${dim.icon}</span>
                </label>`;
            }
            html += '</div>';
            return html;
        }

        bindEvents(toolbar, detailPanel) {
            toolbar.querySelector('#wbap-graph-close').addEventListener('click', () => this.close());
            toolbar.querySelector('#wbap-graph-fit').addEventListener('click', () => this.fitToScreen());

            toolbar.querySelector('#wbap-graph-search').addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.draw();
            });

            const labelsCheckbox = toolbar.querySelector('#wbap-graph-labels');
            if (labelsCheckbox) {
                labelsCheckbox.addEventListener('change', (e) => {
                    this.showLabels = e.target.checked;
                    this.draw();
                });
            }

            // 多维筛选事件
            const dimFilters = toolbar.querySelectorAll('.wbap-dim-filter');
            dimFilters.forEach(filter => {
                filter.addEventListener('change', (e) => {
                    const dimId = e.target.dataset.dim;
                    if (e.target.checked) {
                        this.activeDimensions.add(dimId);
                    } else {
                        this.activeDimensions.delete(dimId);
                    }
                    // 更新图标透明度
                    const span = e.target.nextElementSibling;
                    if (span) {
                        span.style.opacity = e.target.checked ? 1 : 0.4;
                    }
                    this.draw();
                });
            });

            // 鼠标事件
            this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
            this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
            this.canvas.addEventListener('mouseup', e => this.onMouseUp(e));
            this.canvas.addEventListener('mouseleave', e => this.onMouseUp(e));
            this.canvas.addEventListener('wheel', e => this.onWheel(e));
            this.canvas.addEventListener('dblclick', e => this.onDoubleClick(e));

            // 触摸事件
            this.canvas.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
            this.canvas.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
            this.canvas.addEventListener('touchend', e => this.onTouchEnd(e));

            window.addEventListener('resize', () => this.onResize());
        }

        // 触摸事件处理
        onTouchStart(e) {
            e.preventDefault();

            if (e.touches.length === 1) {
                // 单指：选择节点或开始平移
                const touch = e.touches[0];
                const worldPos = this.screenToWorld(touch.clientX, touch.clientY - this.toolbarHeight);
                const hit = this.findNodeAt(worldPos.x, worldPos.y);

                if (hit) {
                    this.selectedNode = hit;
                    this.showNodeDetail(hit);
                    this.draw();
                } else {
                    this.touchStartPos = { x: touch.clientX, y: touch.clientY };
                    this.touchStartTransform = { x: this.transform.x, y: this.transform.y };
                }
            } else if (e.touches.length === 2) {
                // 双指：开始缩放
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                this.pinchStartDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                this.pinchStartScale = this.transform.k;
                this.pinchCenter = {
                    x: (touch1.clientX + touch2.clientX) / 2,
                    y: (touch1.clientY + touch2.clientY) / 2 - this.toolbarHeight
                };
            }
        }

        onTouchMove(e) {
            e.preventDefault();

            if (e.touches.length === 1 && this.touchStartPos) {
                // 单指平移
                const touch = e.touches[0];
                const dx = touch.clientX - this.touchStartPos.x;
                const dy = touch.clientY - this.touchStartPos.y;
                this.transform.x = this.touchStartTransform.x + dx;
                this.transform.y = this.touchStartTransform.y + dy;
                this.draw();
            } else if (e.touches.length === 2 && this.pinchStartDist) {
                // 双指缩放
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
                const scale = currentDist / this.pinchStartDist;

                const newK = Math.max(0.2, Math.min(3, this.pinchStartScale * scale));
                const factor = newK / this.transform.k;

                this.transform.x = this.pinchCenter.x - (this.pinchCenter.x - this.transform.x) * factor;
                this.transform.y = this.pinchCenter.y - (this.pinchCenter.y - this.transform.y) * factor;
                this.transform.k = newK;

                this.draw();
            }
        }

        onTouchEnd(e) {
            this.touchStartPos = null;
            this.touchStartTransform = null;
            this.pinchStartDist = null;
            this.pinchStartScale = null;
            this.pinchCenter = null;
        }

        fitToScreen() {
            if (!this.graphBounds) return;

            const padding = 100;
            const graphWidth = this.graphBounds.maxX - this.graphBounds.minX;
            const graphHeight = this.graphBounds.maxY - this.graphBounds.minY;

            const scaleX = (this.canvas.width - padding * 2) / graphWidth;
            const scaleY = (this.canvas.height - padding * 2) / graphHeight;
            this.transform.k = Math.min(scaleX, scaleY, 2);

            this.transform.x = padding - this.graphBounds.minX * this.transform.k;
            this.transform.y = this.canvas.height / 2 - (this.graphBounds.minY + graphHeight / 2) * this.transform.k;

            this.draw();
        }

        close() {
            this.active = false;
            if (this.container) {
                document.body.removeChild(this.container);
                this.container = null;
            }
        }

        draw() {
            if (!this.active || !this.ctx) return;

            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.save();
            ctx.translate(this.transform.x, this.transform.y);
            ctx.scale(this.transform.k, this.transform.k);

            // 绘制链接（曲线）- 支持多维边
            this.links.forEach(l => {
                const a = l.sourceNode;
                const b = l.targetNode;
                if (!a || !b) return;

                // 多维边筛选
                if (this.isMultiDim && l.dimensions) {
                    const hasActiveDim = l.dimensions.some(d =>
                        this.activeDimensions.has(d.dimension?.id || d.dimension)
                    );
                    if (!hasActiveDim) return;
                }

                const isHighlighted = this.isNodeHighlighted(a) || this.isNodeHighlighted(b);

                // 多维边：绘制多条彩色线
                if (this.isMultiDim && l.dimensions && l.dimensions.length > 0) {
                    this.drawMultiDimEdge(ctx, a, b, l, isHighlighted);
                } else {
                    // 单维边：原有逻辑
                    const typeInfo = l.typeInfo || { color: '#555' };
                    const alpha = isHighlighted ? 0.9 : 0.4;

                    ctx.beginPath();
                    ctx.strokeStyle = this.hexToRgba(typeInfo.color, alpha);
                    ctx.lineWidth = (l.bidirectional ? 2 : 1) / this.transform.k;

                    // 贝塞尔曲线
                    const midX = (a.x + b.x) / 2;
                    ctx.moveTo(a.x, a.y);
                    ctx.bezierCurveTo(midX, a.y, midX, b.y, b.x, b.y);
                    ctx.stroke();

                    // 箭头
                    const arrowSize = 6 / this.transform.k;
                    const angle = Math.atan2(b.y - a.y, b.x - midX);
                    ctx.fillStyle = typeInfo.color;
                    ctx.beginPath();
                    ctx.moveTo(b.x - 12, b.y);
                    ctx.lineTo(b.x - 12 - arrowSize * Math.cos(angle - Math.PI / 6), b.y - arrowSize * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(b.x - 12 - arrowSize * Math.cos(angle + Math.PI / 6), b.y - arrowSize * Math.sin(angle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fill();
                }
            });

            // 绘制节点
            this.nodes.forEach(n => {
                const isHighlighted = this.isNodeHighlighted(n);
                const isSelected = this.selectedNode === n;
                const isHovered = this.hoveredNode === n;
                const isSearchMatch = this.searchQuery && this.matchesSearch(n);
                const typeInfo = n.typeInfo || { color: '#00ccff' };

                // 节点尺寸
                const nodeWidth = 120;
                const nodeHeight = 36;
                const radius = 6;

                // 透明度
                let alpha = 0.9;
                if (this.searchQuery && !isSearchMatch) alpha = 0.2;
                if (isHighlighted) alpha = 1;

                // 绘制节点背景（圆角矩形）
                ctx.globalAlpha = alpha;

                // 发光效果
                if (isHighlighted || isSelected) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = typeInfo.color;
                } else {
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = typeInfo.color;
                }

                // 圆角矩形
                ctx.fillStyle = isSelected ? typeInfo.color : this.hexToRgba(typeInfo.color, 0.2);
                ctx.strokeStyle = typeInfo.color;
                ctx.lineWidth = isHighlighted ? 2 : 1;

                this.roundRect(ctx, n.x - nodeWidth / 2, n.y - nodeHeight / 2, nodeWidth, nodeHeight, radius);
                ctx.fill();
                ctx.stroke();

                ctx.shadowBlur = 0;

                // 类型图标
                const icon = n.typeInfo?.icon || '📄';
                ctx.font = '14px Arial';
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'left';
                ctx.fillText(icon, n.x - nodeWidth / 2 + 8, n.y + 5);

                // 标签
                if (this.showLabels) {
                    const label = n.label.length > 12 ? n.label.substring(0, 12) + '...' : n.label;
                    ctx.fillStyle = isSelected ? '#000' : '#fff';
                    ctx.font = `${isHighlighted ? 'bold ' : ''}12px Arial`;
                    ctx.textAlign = 'left';
                    ctx.fillText(label, n.x - nodeWidth / 2 + 28, n.y + 4);
                }

                // 重要度指示器
                if (n.importance > 0.5) {
                    ctx.fillStyle = '#ffcc00';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'right';
                    ctx.fillText('★', n.x + nodeWidth / 2 - 8, n.y + 4);
                }

                ctx.globalAlpha = 1;
            });

            ctx.restore();

            // 绘制迷你地图
            this.drawMinimap();
        }

        roundRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }

        drawMultiDimEdge(ctx, a, b, link, isHighlighted) {
            const activeDims = link.dimensions.filter(d =>
                this.activeDimensions.has(d.dimension?.id || d.dimension)
            );

            if (activeDims.length === 0) return;

            const alpha = isHighlighted ? 0.9 : 0.5;
            const midX = (a.x + b.x) / 2;

            // 多条线偏移绘制
            const offsetStep = 3 / this.transform.k;
            const totalOffset = (activeDims.length - 1) * offsetStep;
            let currentOffset = -totalOffset / 2;

            activeDims.forEach((dimInfo, index) => {
                const dim = dimInfo.dimension;
                const color = dim?.color || '#888';
                const strength = dimInfo.strength || 0.5;

                ctx.beginPath();
                ctx.strokeStyle = this.hexToRgba(color, alpha * strength);
                ctx.lineWidth = (1 + strength) / this.transform.k;

                // 带偏移的贝塞尔曲线
                const offsetY = currentOffset;
                ctx.moveTo(a.x, a.y + offsetY);
                ctx.bezierCurveTo(
                    midX, a.y + offsetY,
                    midX, b.y + offsetY,
                    b.x, b.y + offsetY
                );
                ctx.stroke();

                currentOffset += offsetStep;
            });

            // 绘制箭头（使用主维度颜色）
            const mainDim = activeDims[0]?.dimension;
            const arrowColor = mainDim?.color || '#888';
            const arrowSize = 6 / this.transform.k;
            const angle = Math.atan2(b.y - a.y, b.x - midX);

            ctx.fillStyle = this.hexToRgba(arrowColor, alpha);
            ctx.beginPath();
            ctx.moveTo(b.x - 12, b.y);
            ctx.lineTo(b.x - 12 - arrowSize * Math.cos(angle - Math.PI / 6), b.y - arrowSize * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(b.x - 12 - arrowSize * Math.cos(angle + Math.PI / 6), b.y - arrowSize * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();
        }

        drawMinimap() {
            if (!this.minimap || !this.graphBounds) return;

            const ctx = this.minimap.getContext('2d');
            const w = this.minimap.width;
            const h = this.minimap.height;

            ctx.clearRect(0, 0, w, h);

            // 计算缩放比例
            const graphWidth = this.graphBounds.maxX - this.graphBounds.minX;
            const graphHeight = this.graphBounds.maxY - this.graphBounds.minY;
            const scale = Math.min(w / graphWidth, h / graphHeight) * 0.8;
            const offsetX = (w - graphWidth * scale) / 2 - this.graphBounds.minX * scale;
            const offsetY = (h - graphHeight * scale) / 2 - this.graphBounds.minY * scale;

            // 绘制节点
            ctx.fillStyle = '#888';
            this.nodes.forEach(n => {
                ctx.beginPath();
                ctx.arc(n.x * scale + offsetX, n.y * scale + offsetY, 2, 0, Math.PI * 2);
                ctx.fill();
            });

            // 绘制视口
            const viewportX = (-this.transform.x / this.transform.k) * scale + offsetX;
            const viewportY = (-this.transform.y / this.transform.k) * scale + offsetY;
            const viewportW = (this.canvas.width / this.transform.k) * scale;
            const viewportH = (this.canvas.height / this.transform.k) * scale;

            ctx.strokeStyle = '#88ffcc';
            ctx.lineWidth = 1;
            ctx.strokeRect(viewportX, viewportY, viewportW, viewportH);
        }

        isNodeHighlighted(node) {
            if (this.selectedNode) {
                if (node === this.selectedNode) return true;
                return this.links.some(l =>
                    (l.sourceNode === this.selectedNode && l.targetNode === node) ||
                    (l.targetNode === this.selectedNode && l.sourceNode === node)
                );
            }
            if (this.hoveredNode === node) return true;
            return false;
        }

        matchesSearch(node) {
            if (!this.searchQuery) return false;
            return node.label.toLowerCase().includes(this.searchQuery) ||
                node.keysLower?.some(k => k.includes(this.searchQuery));
        }

        hexToRgba(hex, alpha) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (result) {
                return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
            }
            return hex;
        }

        showNodeDetail(node) {
            const panel = document.getElementById('wbap-graph-detail');
            const typeInfo = node.typeInfo || {};
            const connections = this.links.filter(l => l.sourceNode === node || l.targetNode === node);

            // 多维重要度信息
            let multiDimInfo = '';
            if (this.isMultiDim && node.multiDimImportance) {
                const EDGE_DIMENSIONS = WBAP.EDGE_DIMENSIONS || {};
                const dimScores = Object.entries(node.multiDimImportance)
                    .filter(([_, v]) => v > 0.1)
                    .map(([dimId, score]) => {
                        const dim = Object.values(EDGE_DIMENSIONS).find(d => d.id === dimId);
                        return dim ? `${dim.icon}${(score * 100).toFixed(0)}%` : null;
                    })
                    .filter(Boolean);
                if (dimScores.length > 0) {
                    multiDimInfo = `<div style="color: #aaa; font-size: 11px; margin-bottom: 8px;">
                        维度重要度: ${dimScores.join(' ')}
                    </div>`;
                }
            }

            // 事件摘要信息
            let eventInfo = '';
            if (node.eventSummary) {
                eventInfo = `<div style="border-top: 1px solid #333; padding-top: 10px; margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">📅 事件信息</div>
                    <div style="color: #ccc; font-size: 12px;">
                        ${node.eventSummary.temporal ? `时间: ${node.eventSummary.temporal.join(', ')}<br>` : ''}
                        ${node.eventSummary.spatial ? `地点: ${node.eventSummary.spatial.join(', ')}<br>` : ''}
                        ${node.eventSummary.emotional ? `情感: ${node.eventSummary.emotional}` : ''}
                    </div>
                </div>`;
            }

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; color: ${typeInfo.color};">${typeInfo.icon || '📄'} ${node.label}</h4>
                    <button id="wbap-detail-close" style="background: none; border: none; color: #888; cursor: pointer; font-size: 18px;">&times;</button>
                </div>
                <div style="color: #888; font-size: 11px; margin-bottom: 8px;">
                    类型: ${typeInfo.label || '未知'} | 层级: ${node.level || 0} | 重要度: ${(node.importance * 100).toFixed(0)}%
                </div>
                ${multiDimInfo}
                <div style="color: #aaa; font-size: 11px; margin-bottom: 8px;">
                    关键词: ${node.keys?.join(', ') || '无'}
                </div>
                <div style="border-top: 1px solid #333; padding-top: 10px; margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">内容预览</div>
                    <div style="color: #ccc; font-size: 12px; max-height: 150px; overflow-y: auto; line-height: 1.5;">
                        ${node.content?.substring(0, 500) || '无内容'}${node.content?.length > 500 ? '...' : ''}
                    </div>
                </div>
                ${eventInfo}
                <div style="border-top: 1px solid #333; padding-top: 10px; margin-top: 10px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">关联 (${connections.length})</div>
                    <div style="max-height: 100px; overflow-y: auto;">
                        ${connections.map(l => {
                const other = l.sourceNode === node ? l.targetNode : l.sourceNode;
                const direction = l.sourceNode === node ? '→' : '←';
                // 多维边显示维度
                let dimIcons = '';
                if (this.isMultiDim && l.dimensions) {
                    dimIcons = l.dimensions.map(d => d.dimension?.icon || '').join('');
                }
                const rel = l.typeInfo?.label || '引用';
                return `<div style="font-size: 11px; color: #aaa; margin: 2px 0;">${direction} ${other.label} ${dimIcons ? `(${dimIcons})` : `(${rel})`}</div>`;
            }).join('')}
                    </div>
                </div>
            `;

            panel.style.display = 'block';
            panel.querySelector('#wbap-detail-close').addEventListener('click', () => {
                panel.style.display = 'none';
                this.selectedNode = null;
                this.draw();
            });
        }

        // 事件处理
        onMouseDown(e) {
            const worldPos = this.screenToWorld(e.clientX, e.clientY - (this.toolbarHeight || 50));
            const hit = this.findNodeAt(worldPos.x, worldPos.y);

            if (hit) {
                this.selectedNode = hit;
                this.showNodeDetail(hit);
                this.draw();
            } else {
                this.panning = true;
                this.panStart = { x: e.clientX, y: e.clientY, tx: this.transform.x, ty: this.transform.y };
                this.canvas.style.cursor = 'grabbing';
            }
        }

        onMouseMove(e) {
            const worldPos = this.screenToWorld(e.clientX, e.clientY - (this.toolbarHeight || 50));

            if (this.panning && this.panStart) {
                const dx = e.clientX - this.panStart.x;
                const dy = e.clientY - this.panStart.y;
                this.transform.x = this.panStart.tx + dx;
                this.transform.y = this.panStart.ty + dy;
                this.draw();
            } else {
                // 悬停检测
                const newHovered = this.findNodeAt(worldPos.x, worldPos.y);
                if (newHovered !== this.hoveredNode) {
                    this.hoveredNode = newHovered;
                    this.canvas.style.cursor = newHovered ? 'pointer' : 'grab';
                    this.draw();
                }
            }
        }

        onMouseUp() {
            this.panning = false;
            this.panStart = null;
            this.canvas.style.cursor = this.hoveredNode ? 'pointer' : 'grab';
        }

        onDoubleClick(e) {
            const worldPos = this.screenToWorld(e.clientX, e.clientY - (this.toolbarHeight || 50));
            const hit = this.findNodeAt(worldPos.x, worldPos.y);

            if (hit) {
                // 双击居中节点
                this.transform.x = this.canvas.width / 2 - hit.x * this.transform.k;
                this.transform.y = this.canvas.height / 2 - hit.y * this.transform.k;
                this.draw();
            }
        }

        onWheel(e) {
            e.preventDefault();
            const zoomIntensity = 0.1;
            const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

            // 以鼠标位置为中心缩放
            const mouseX = e.clientX;
            const mouseY = e.clientY - (this.toolbarHeight || 50);

            const newK = Math.max(0.1, Math.min(3, this.transform.k * delta));
            const factor = newK / this.transform.k;

            this.transform.x = mouseX - (mouseX - this.transform.x) * factor;
            this.transform.y = mouseY - (mouseY - this.transform.y) * factor;
            this.transform.k = newK;

            this.draw();
        }

        onResize() {
            if (this.canvas) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight - (this.toolbarHeight || 50);
                this.draw();
            }
        }

        screenToWorld(screenX, screenY) {
            return {
                x: (screenX - this.transform.x) / this.transform.k,
                y: (screenY - this.transform.y) / this.transform.k
            };
        }

        findNodeAt(worldX, worldY) {
            const nodeWidth = 120;
            const nodeHeight = 36;

            for (let i = this.nodes.length - 1; i >= 0; i--) {
                const n = this.nodes[i];
                if (worldX >= n.x - nodeWidth / 2 && worldX <= n.x + nodeWidth / 2 &&
                    worldY >= n.y - nodeHeight / 2 && worldY <= n.y + nodeHeight / 2) {
                    return n;
                }
            }
            return null;
        }
    }

    WBAP.GraphView = new GraphViewer();
    console.log('[GraphView] 多维树状图版本已加载');
})();
