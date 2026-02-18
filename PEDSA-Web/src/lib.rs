use wasm_bindgen::prelude::*;
use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use ahash::AHashMap;
use smallvec::SmallVec;
// use rayon::prelude::*;
// use std::time::Instant;
use std::hash::{Hash, Hasher};
use twox_hash::XxHash64;
use half::f16;

// mod storage; // Storage logic is disabled for WASM build to avoid I/O dependencies
mod embedding;
mod storage_bridge;
use embedding::StaticModel;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Macro for console.log
#[allow(unused_macros)]
macro_rules! console_log {
    ($($t:tt)*) => (log(&format!($($t)*)))
}

// ============================================================================
// 1. 语义指纹 (SimHash V2: Partitioned Multimodal)
// ============================================================================

#[wasm_bindgen]
pub struct SimHash;

impl SimHash {
    pub const MASK_SEMANTIC: u64 = 0xFFFFFFFF;
    pub const MASK_TEMPORAL: u64 = 0xFFFF00000000; // [32-47]: 时间区 (Temporal only - Location removed in V3)
    pub const MASK_AFFECTIVE: u64 = 0x00FF000000000000;
    pub const MASK_TYPE: u64 = 0xFF00000000000000;

    // --- Entity Type Constants ---
    pub const TYPE_UNKNOWN: u8 = 0x00;
    pub const TYPE_PERSON: u8 = 0x01;    // 人物/身份
    pub const TYPE_TECH: u8 = 0x02;      // 技术/概念
    pub const TYPE_EVENT: u8 = 0x03;     // 事件/动作
    pub const TYPE_LOCATION: u8 = 0x04;  // 地点
    pub const TYPE_OBJECT: u8 = 0x05;    // 物件
    pub const TYPE_VALUES: u8 = 0x06;    // 价值观

    // --- Edge Type Constants (V3.5 Typed Edges - Simplified) ---
    pub const EDGE_REPRESENTATION: u8 = 0; // 表征 (Representation) - "看到 B 可能会想到 A" (单向/非等价)
    pub const EDGE_EQUALITY: u8 = 1;       // 等价 (Equality) - "A 就是 B" (双向/零损耗)
    pub const EDGE_INHIBITION: u8 = 255;   // 抑制 (Inhibition) - "A 与 B 互斥" (双向/负反馈)

    // --- Affective Constants (Plutchik's Wheel Bitmap - Adjusted) ---
    pub const EMOTION_JOY: u8          = 1 << 0; // 喜悦
    pub const EMOTION_SHY: u8          = 1 << 1; // 害羞
    pub const EMOTION_FEAR: u8         = 1 << 2; // 害怕
    pub const EMOTION_SURPRISE: u8     = 1 << 3; // 惊讶
    pub const EMOTION_SADNESS: u8      = 1 << 4; // 难过
    pub const EMOTION_DISGUST: u8      = 1 << 5; // 讨厌
    pub const EMOTION_ANGER: u8        = 1 << 6; // 生气
    pub const EMOTION_ANTICIPATION: u8 = 1 << 7; // 期待
}

#[wasm_bindgen]
impl SimHash {
    /// 计算多模态分区指纹 (64-bit)
    pub fn compute_multimodal_wasm(text: &str, timestamp: u64, emotion_val: u8, type_val: u8) -> u64 {
        Self::compute_multimodal(text, timestamp, emotion_val, type_val)
    }
    
    pub fn compute_for_query_wasm(query: &str, ref_time: u64) -> u64 {
        Self::compute_for_query(query, ref_time)
    }

    /// JS compatible quantization (f32 array -> hex string)
    pub fn quantize_vector_js(vec: &[f32]) -> String {
        let val = Self::quantize_vector_f32(vec);
        format!("{:032x}", val)
    }
}

impl SimHash {
    /// 向量二值化量化 (128-dim f16 -> 128-bit u128)
    pub fn quantize_vector(vec: &[f16]) -> u128 {
        let mut fp: u128 = 0;
        for (i, &val) in vec.iter().enumerate().take(128) {
            if val.to_f32() > 0.0 {
                fp |= 1 << i;
            }
        }
        fp
    }

    pub fn quantize_vector_f32(vec: &[f32]) -> u128 {
        let mut fp: u128 = 0;
        for (i, &val) in vec.iter().enumerate().take(128) {
            if val > 0.0 {
                fp |= 1 << i;
            }
        }
        fp
    }
}

impl SimHash {
    /// 计算多模态分区指纹 (64-bit)
    /// [0-31]: 语义区 (Text)
    /// [32-47]: 时间区 (Temporal)
    /// [48-55]: 情感区 (Affective)
    /// [56-63]: 类型区 (Entity Type)
    pub fn compute_multimodal(text: &str, timestamp: u64, emotion_val: u8, type_val: u8) -> u64 {
        let mut fp = 0u64;

        // 1. 语义区 [0-31] (32 bits)
        let semantic_hash = Self::compute_text_hash_32(text);
        fp |= (semantic_hash as u64) & Self::MASK_SEMANTIC;

        // 2. 时间区 [32-47] (16 bits) - 仅保留时间
        if timestamp > 0 {
            let t_hash = Self::compute_temporal_hash(timestamp);
            fp |= ((t_hash as u64) << 32) & Self::MASK_TEMPORAL;
        }

        // 3. 情感区 [48-55] (8 bits)
        fp |= ((emotion_val as u64) << 48) & Self::MASK_AFFECTIVE;

        // 4. 类型区 [56-63] (8 bits)
        fp |= ((type_val as u64) << 56) & Self::MASK_TYPE;

        fp
    }

    /// 针对查询字符串的智能指纹生成 (Enhanced Temporal Awareness)
    /// ref_time: 外部传入的参考时间戳（现实时间或叙事时间），用于解析相对时间
    pub fn compute_for_query(query: &str, ref_time: u64) -> u64 {
        let mut timestamp = 0u64;
        let mut emotion = 0u8;
        let mut type_val = Self::TYPE_UNKNOWN;

        let query_lower = query.to_lowercase();

        // --- 1. 相对时间解析 (Relative Time Resolution) ---
        // 只有当 ref_time 有效 (>0) 时才启用相对时间解析
        if ref_time > 0 {
            // 0. 今天/今日/此刻 (Present)
            if query_lower.contains("今天") || query_lower.contains("今日") || query_lower.contains("today") || 
               query_lower.contains("now") || query_lower.contains("此刻") || query_lower.contains("当前") {
                timestamp = ref_time;
            }
            // 1. 昨天/昨日 (1 Day Ago)
            else if query_lower.contains("昨天") || query_lower.contains("昨日") || query_lower.contains("yesterday") {
                timestamp = ref_time.saturating_sub(86400);
            }
            // 2. 前天/前日 (2 Days Ago)
            else if query_lower.contains("前天") || query_lower.contains("前日") {
                timestamp = ref_time.saturating_sub(172800);
            }
            // 3. 大前天 (3 Days Ago)
            else if query_lower.contains("大前天") {
                timestamp = ref_time.saturating_sub(259200);
            }
            // 4. 前几天/Recently (Approx 3 Days Ago) - 模糊匹配
            else if query_lower.contains("前几天") || query_lower.contains("最近") || query_lower.contains("recently") {
                timestamp = ref_time.saturating_sub(259200);
            }
            // 5. 上周/Last Week (7 Days Ago)
            else if query_lower.contains("上周") || query_lower.contains("last week") {
                timestamp = ref_time.saturating_sub(604800);
            }
            // 6. 上个月/Last Month (30 Days Ago)
            else if query_lower.contains("上个月") || query_lower.contains("上月") || query_lower.contains("last month") {
                timestamp = ref_time.saturating_sub(2592000);
            }
            // 7. 去年/Last Year (365 Days Ago)
            else if query_lower.contains("去年") || query_lower.contains("last year") {
                timestamp = ref_time.saturating_sub(31536000); 
            }
            // 8. 前年 (2 Years Ago)
            else if query_lower.contains("前年") {
                timestamp = ref_time.saturating_sub(63072000); 
            }
            // 9. 刚才/刚刚 (Just Now - 1 min ago)
            else if query_lower.contains("刚才") || query_lower.contains("刚刚") || query_lower.contains("just now") {
                timestamp = ref_time.saturating_sub(60); 
            }
            // 10. 早上/上午 (Morning - Assume 9:00 AM of current day)
            // 这是一个粗略的锚点，如果 ref_time 已经是当天，我们其实只需要当天的日期部分
            // 但为了简化，这里暂时指向 ref_time (当天)
            else if query_lower.contains("早上") || query_lower.contains("上午") || query_lower.contains("morning") {
                 timestamp = ref_time; 
            }
        }

        // --- 2. 绝对时间解析 (Absolute Time Fallback) ---
        // 只有在相对时间未命中时才尝试绝对年份匹配
        if timestamp == 0 {
            if query_lower.contains("2024") { timestamp = 1704067200; } // 2024-01-01
            if query_lower.contains("2025") { timestamp = 1735689600; } // 2025-01-01
            if query_lower.contains("2026") { timestamp = 1767225600; } // 2026-01-01
        }
        
        // Mock Emotion Extraction (Plutchik's Wheel)
        if query_lower.contains("开心") || query_lower.contains("欣慰") || query_lower.contains("棒") || query_lower.contains("成功") { 
            emotion |= Self::EMOTION_JOY; 
        }
        if query_lower.contains("害羞") || query_lower.contains("不好意思") || query_lower.contains("脸红") { 
            emotion |= Self::EMOTION_SHY; 
        }
        if query_lower.contains("害怕") || query_lower.contains("担心") || query_lower.contains("焦虑") { 
            emotion |= Self::EMOTION_FEAR; 
        }
        if query_lower.contains("没想到") || query_lower.contains("竟然") || query_lower.contains("惊讶") { 
            emotion |= Self::EMOTION_SURPRISE; 
        }
        if query_lower.contains("难过") || query_lower.contains("低落") || query_lower.contains("失望") || query_lower.contains("遗憾") { 
            emotion |= Self::EMOTION_SADNESS; 
        }
        if query_lower.contains("讨厌") || query_lower.contains("不喜欢") || query_lower.contains("烂") { 
            emotion |= Self::EMOTION_DISGUST; 
        }
        if query_lower.contains("生气") || query_lower.contains("恼火") || query_lower.contains("不爽") { 
            emotion |= Self::EMOTION_ANGER; 
        }
        if query_lower.contains("期待") || query_lower.contains("愿景") || query_lower.contains("未来") || query_lower.contains("规划") { 
            emotion |= Self::EMOTION_ANTICIPATION; 
        }

        // Mock Type Inference
        if query_lower.contains("pero") || query_lower.contains("用户") || query_lower.contains("女孩") {
            type_val = Self::TYPE_PERSON;
        } else if query_lower.contains("rust") || query_lower.contains("代码") || query_lower.contains("算法") {
            type_val = Self::TYPE_TECH;
        } else if query_lower.contains("事情") || query_lower.contains("发生") {
            type_val = Self::TYPE_EVENT;
        } else if query_lower.contains("蝴蝶结") || query_lower.contains("键盘") {
            type_val = Self::TYPE_OBJECT;
        }

        Self::compute_multimodal(&query_lower, timestamp, emotion, type_val)
    }

    /// 传统的 SimHash 计算 (仅用于语义区，压缩到 32 位)
    pub fn compute_text_hash_32(text: &str) -> u32 {
        let text_lower = text.to_lowercase();
        let mut v = [0i32; 32];
        
        for word in text_lower.split_whitespace() {
            Self::update_v_32(&mut v, word);
        }
        // 处理中文等无空格字符
        for c in text_lower.chars() {
            let mut buf = [0u8; 4];
            let s = c.encode_utf8(&mut buf);
            Self::update_v_32(&mut v, s);
        }

        let mut finger_print = 0u32;
        for i in 0..32 {
            if v[i] > 0 {
                finger_print |= 1 << i;
            }
        }
        finger_print
    }

    /// 兼容旧版接口 (仅计算文本，其他默认为 0)
    pub fn compute(text: &str) -> u64 {
        Self::compute_multimodal(text, 0, 0, 0)
    }

    fn update_v_32(v: &mut [i32; 32], token: &str) {
        let mut hasher = XxHash64::with_seed(0);
        token.hash(&mut hasher);
        let hash = hasher.finish();
        
        for i in 0..32 {
            let bit = (hash >> i) & 1;
            if bit == 1 {
                v[i] += 1;
            } else {
                v[i] -= 1;
            }
        }
    }

    fn compute_temporal_hash(timestamp: u64) -> u16 {
        // 纯时间戳哈希
        let mut hasher = XxHash64::with_seed(12345); // 独立 Seed
        timestamp.hash(&mut hasher);
        let h = hasher.finish();
        (h & 0xFFFF) as u16
    }

    /// 计算加权汉明距离相似度 (V2: 支持分区权重掩码)
    /// mask: 用于指定只关注哪些区域 (例如只关注时空区)
    pub fn similarity_weighted(a: u64, b: u64, mask: u64) -> f32 {
        let xor = (a ^ b) & mask;
        let dist = xor.count_ones();
        let total_bits = mask.count_ones();
        if total_bits == 0 { return 0.0; }
        1.0 - (dist as f32 / total_bits as f32)
    }
    
    /// 原始相似度接口
    pub fn similarity(a: u64, b: u64) -> f32 {
        // 默认全区匹配
        Self::similarity_weighted(a, b, 0xFFFFFFFFFFFFFFFF)
    }
}

// ============================================================================
// 2. 核心数据结构
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeType {
    Feature, // 特征锚点（关键词、实体）
    Event,   // 事件总结节点（记忆主体）
}

#[derive(Clone, Debug)]
pub struct GraphEdge {
    pub target_node_id: i64,
    pub connection_strength: u16,
    pub edge_type: u8, // V2: 0=Assoc, 1=Cause, 2=Seq, 3=Contrast
}

pub struct Node {
    pub id: i64,
    pub node_type: NodeType,
    pub content: String,       // 对于 Event 是总结，对于 Feature 是关键词
    pub fingerprint: u64,      // 语义指纹
    
    // V2 New Fields
    pub timestamp: u64,        // Unix 时间戳
    pub emotions: SmallVec<[u8; 8]>, // 情感矢量 (8维)
    pub prev_event: Option<i64>,     // 时序前驱
    pub next_event: Option<i64>,     // 时序后继
}

// ============================================================================
// 3. 高级实验引擎
// ============================================================================

pub struct ChaosStore {
    pub ids: Vec<i64>,
    pub fingerprints: Vec<u128>,
    pub vectors: Vec<Vec<f16>>,
    pub id_to_index: AHashMap<i64, usize>,
}

impl ChaosStore {
    pub fn new() -> Self {
        Self {
            ids: Vec::new(),
            fingerprints: Vec::new(),
            vectors: Vec::new(),
            id_to_index: AHashMap::new(),
        }
    }

    pub fn add(&mut self, id: i64, fp: u128, vec: Vec<f16>) {
        if !self.id_to_index.contains_key(&id) {
            let idx = self.ids.len();
            self.ids.push(id);
            self.fingerprints.push(fp);
            self.vectors.push(vec);
            self.id_to_index.insert(id, idx);
        }
    }
}

pub trait AsyncTaskInterface {
    fn schedule_maintenance(&self, context: &str);
}

pub struct MockAsyncTask;
impl AsyncTaskInterface for MockAsyncTask {
    fn schedule_maintenance(&self, _context: &str) {
        // Placeholder
    }
}

pub struct AdvancedEngine {
    pub nodes: AHashMap<i64, Node>,
    pub chaos_store: ChaosStore,
    pub graph: AHashMap<i64, SmallVec<[GraphEdge; 4]>>,
    
    // 第一套数据库：定义库 (Ontology)
    pub ontology_graph: AHashMap<i64, SmallVec<[GraphEdge; 4]>>,
    
    // 搜索辅助
    pub ac_matcher: Option<AhoCorasick>,
    pub feature_keywords: Vec<String>,
    pub keyword_to_node: AHashMap<String, i64>,
    
    // V2: 性能控制
    pub in_degrees: AHashMap<i64, u32>, // 预计算入度
    
    // V2: 时空索引 (Temporal Index) - 用于快速共振召回
    pub temporal_index: AHashMap<u16, Vec<i64>>,
    
    // V2: 情感索引 (Affective Index) - 用于情感共振
    pub affective_index: AHashMap<u8, Vec<i64>>,

    // V2: 异步接口
    pub async_task: Box<dyn AsyncTaskInterface + Send + Sync>,

    // Phase 4: Static Embedding Model
    pub embedding_model: Option<StaticModel>,
}

#[wasm_bindgen]
pub struct PedsaEngine {
    inner: AdvancedEngine,
}

#[wasm_bindgen]
impl PedsaEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            inner: AdvancedEngine::new()
        }
    }

    pub fn load_model_from_bytes(&mut self, data: &[u8]) -> Result<(), JsValue> {
        let model = StaticModel::load_from_bytes(data)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.inner.embedding_model = Some(model);
        Ok(())
    }

    pub fn add_feature(&mut self, id: i64, keyword: &str) {
        self.inner.add_feature(id, keyword);
    }

    pub fn add_event(&mut self, id: i64, summary: &str) {
        // Simple wrapper without chaos for now
        self.inner.add_event(id, summary, None, None);
    }

    pub fn add_edge(&mut self, src: i64, tgt: i64, weight: f32) {
        self.inner.add_edge(src, tgt, weight);
    }

    pub fn maintain_ontology(&mut self, source: &str, target: &str, relation_type: &str, strength: f32) {
        self.inner.maintain_ontology(source, target, relation_type, strength);
    }

    pub fn compile(&mut self) {
        self.inner.compile();
    }

    pub fn prune_ontology(&mut self) {
        self.inner.prune_ontology();
    }

    /// Returns JSON string of results with content
    pub fn retrieve(&self, query: &str, ref_time: u64, chaos_level: f32) -> String {
        let results = self.inner.retrieve(query, ref_time, chaos_level);
        // Manual JSON serialization to avoid serde overhead for now
        let mut json = String::from("[");
        for (i, (id, score)) in results.iter().enumerate() {
            if i > 0 { json.push(','); }
            let node_opt = self.inner.nodes.get(id);
            let content = node_opt.map(|n| n.content.as_str()).unwrap_or("");
            let timestamp = node_opt.map(|n| n.timestamp).unwrap_or(0);
            
            // Escape quotes in content for JSON
            let escaped_content = content.replace("\"", "\\\"");
            json.push_str(&format!("{{\"id\":{},\"score\":{:.4},\"content\":\"{}\",\"timestamp\":{}}}", id, score, escaped_content, timestamp));
        }
        json.push(']');
        json
    }
}

impl AdvancedEngine {
    pub fn new() -> Self {
        Self {
            nodes: AHashMap::new(),
            chaos_store: ChaosStore::new(),
            graph: AHashMap::new(),
            ontology_graph: AHashMap::new(),
            ac_matcher: None,
            feature_keywords: Vec::new(),
            keyword_to_node: AHashMap::new(),
            in_degrees: AHashMap::new(),
            temporal_index: AHashMap::new(),
            affective_index: AHashMap::new(),
            async_task: Box::new(MockAsyncTask),
            embedding_model: None,
        }
    }

    /// 添加特征节点
    pub fn add_feature(&mut self, id: i64, keyword: &str) {
        let keyword_lower = keyword.to_lowercase();
        
        // --- 停用词硬过滤 (双保险机制) ---
        // 包含中英文常见的虚词、介词、代词、助动词及连词
        let stopwords = [
            // 中文虚词
            "的", "是", "了", "在", "我", "你", "他", "她", "它", "们", "这", "那", "都", "和", "并", "且",
            "也", "就", "着", "吧", "吗", "呢", "啊", "呀", "呜", "哎", "哼", "呸", "喽",
            // English Prepositions
            "a", "an", "the", "about", "above", "across", "after", "against", "along", "among", "around", "at", 
            "before", "behind", "below", "beneath", "beside", "between", "beyond", "but", "by", "despite", "down", 
            "during", "except", "for", "from", "in", "inside", "into", "like", "near", "of", "off", "on", "onto", 
            "out", "outside", "over", "past", "since", "through", "throughout", "till", "to", "toward", "under", 
            "underneath", "until", "up", "upon", "with", "within", "without",
            // English Pronouns
            "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours", "he", "him", "his", 
            "she", "her", "hers", "it", "its", "they", "them", "their", "theirs", "this", "that", "these", "those", 
            "who", "whom", "whose", "which", "what", "each", "every", "either", "neither", "some", "any", "no", 
            "none", "both", "few", "many", "other", "another",
            // English Auxiliaries
            "am", "is", "are", "was", "were", "be", "being", "been", "have", "has", "had", "do", "does", "did", 
            "shall", "will", "should", "would", "may", "might", "must", "can", "could",
            // English Conjunctions & Others
            "and", "or", "so", "nor", "yet", "although", "because", "unless", "while", "where", "when", "how", "whether"
        ];
        if stopwords.contains(&keyword_lower.as_str()) {
            return;
        }

        let node = Node {
            id,
            node_type: NodeType::Feature,
            content: keyword_lower.clone(),
            fingerprint: SimHash::compute(&keyword_lower),
            timestamp: 0,
            emotions: SmallVec::new(),
            prev_event: None,
            next_event: None,
        };
        self.nodes.insert(id, node);
        self.feature_keywords.push(keyword_lower.clone());
        self.keyword_to_node.insert(keyword_lower, id);
    }

    /// 辅助：从文本中提取日期并转换为时间戳 (YYYY年MM月DD日)
    fn extract_timestamp(text: &str) -> u64 {
        // 简易解析器，查找 "20xx年xx月xx日"
        // 默认基准时间：2023-01-01 (1672531200)
        let default_ts = 1672531200;
        
        // 遍历所有 "年" 的出现位置
        for (year_idx, _) in text.match_indices("年") {
            if year_idx >= 4 && text.is_char_boundary(year_idx - 4) {
                if let Ok(year) = text[year_idx-4..year_idx].parse::<i32>() {
                    let mut day = 1;
                    
                    let rest = &text[year_idx+3..]; // 跳过 "年" (UTF-8 3 bytes)
                    
                    // 查找 "月"，且距离不应太远 (最多 5 字节，容纳 " 12" 或 "1")
                    if let Some(month_idx) = rest.find("月") {
                        if month_idx <= 5 {
                            let m_str = rest[..month_idx].trim();
                            if let Ok(month) = m_str.parse::<i32>() {
                                
                                let rest_day = &rest[month_idx+3..];
                                // 查找 "日"，距离也不应太远
                                if let Some(day_idx) = rest_day.find("日") {
                                    if day_idx <= 5 {
                                        let d_str = rest_day[..day_idx].trim();
                                        if let Ok(d) = d_str.parse::<i32>() {
                                            day = d;
                                        }
                                    }
                                }
                                
                                // 简单转为 Unix Timestamp
                                let ts = (year as u64 - 1970) * 31536000 + (month as u64) * 2592000 + (day as u64) * 86400;
                                return ts;
                            }
                        }
                    }
                }
            }
        }
        default_ts
    }

    /// 混沌向量化接口：将文本自动转换为 128 维 f16 向量和 1-bit u128 指纹
    pub fn calculate_chaos(&self, text: &str) -> Option<(u128, Vec<f16>)> {
        let model = self.embedding_model.as_ref()?;
        
        let mut weighted_ranges = Vec::new();
        if let Some(matcher) = &self.ac_matcher {
            for mat in matcher.find_iter(&text.to_lowercase()) {
                weighted_ranges.push((mat.start(), mat.end(), 5.0));
            }
        }

        if let Some(vec_f32) = model.vectorize_weighted(text, &weighted_ranges) {
            let chaos_vector: Vec<f16> = vec_f32.iter().map(|&x| f16::from_f32(x)).collect();
            let chaos_fingerprint = SimHash::quantize_vector(&chaos_vector);
            Some((chaos_fingerprint, chaos_vector))
        } else {
            None
        }
    }

    /// 添加事件节点
    pub fn add_event(&mut self, id: i64, summary: &str, chaos_fp: Option<u128>, chaos_vec: Option<Vec<f16>>) {
        // 自动提取时间戳
        let timestamp = Self::extract_timestamp(summary);

        // V2: 在入库时自动进行时空/情感特征提取 (Auto-Tagging)
        // 使用提取到的绝对时间戳来计算初始指纹
        let fingerprint = SimHash::compute_multimodal(summary, timestamp, 0, 0);

        // V3 Phase 4: Auto Vectorization (Chaos Vector)
        let mut chaos_fingerprint = chaos_fp.unwrap_or(0u128);
        let mut chaos_vector = chaos_vec.unwrap_or_default();

        if chaos_fingerprint == 0 && chaos_vector.is_empty() {
            if let Some((fp, vec)) = self.calculate_chaos(summary) {
                chaos_fingerprint = fp;
                chaos_vector = vec;
            }
        }
        
        let node = Node {
            id,
            node_type: NodeType::Event,
            content: summary.to_string(),
            fingerprint,
            timestamp, 
            emotions: SmallVec::new(),
            prev_event: None,
            next_event: None,
        };
        self.nodes.insert(id, node);
        
        // SoA Storage
        if chaos_fingerprint != 0 || !chaos_vector.is_empty() {
             self.chaos_store.add(id, chaos_fingerprint, chaos_vector);
        }

        // V2: 更新倒排索引 (Inverted Indexes) 用于快速召回
        // 1. 时空索引
        if (fingerprint & SimHash::MASK_TEMPORAL) != 0 {
            let st_hash = ((fingerprint & SimHash::MASK_TEMPORAL) >> 32) as u16;
            self.temporal_index.entry(st_hash).or_default().push(id);
        }

        // 2. 情感索引
        if (fingerprint & SimHash::MASK_AFFECTIVE) != 0 {
            let emotion_hash = ((fingerprint & SimHash::MASK_AFFECTIVE) >> 48) as u8;
            for i in 0..8 {
                if (emotion_hash & (1 << i)) != 0 {
                    self.affective_index.entry(1 << i).or_default().push(id);
                }
            }
        }
    }

    /// 建立关联 (V2: 增加重复边检测与强度更新逻辑)
    pub fn add_edge(&mut self, src: i64, tgt: i64, weight: f32) {
        let quantized = (weight.clamp(0.0, 1.0) * 65535.0) as u16;
        let edges = self.graph.entry(src).or_default();
        
        if let Some(edge) = edges.iter_mut().find(|e| e.target_node_id == tgt) {
            // 如果边已存在，更新为较大的强度值 (模拟记忆增强)
            if quantized > edge.connection_strength {
                edge.connection_strength = quantized;
            }
        } else {
            edges.push(GraphEdge {
                target_node_id: tgt,
                connection_strength: quantized,
                edge_type: 0,
            });
        }
    }

    /// 添加定义库关联 (第一套数据库)
    /// is_equality: 是否为等价关系 (Type 3)
    /// is_inhibition: 是否为抑制关系 (Type 255)
    pub fn add_ontology_edge(&mut self, src_word: &str, tgt_word: &str, weight: f32, is_equality: bool, is_inhibition: bool) {
        let src = self.get_or_create_feature(src_word);
        let tgt = self.get_or_create_feature(tgt_word);
        
        if src == -1 || tgt == -1 {
            return; // 屏蔽词不建立关联
        }
        
        let quantized = (weight.clamp(0.0, 1.0) * 65535.0) as u16;
        
        // 确定边类型 (简化为三种核心逻辑)
        let edge_type = if is_equality {
            SimHash::EDGE_EQUALITY
        } else if is_inhibition {
            SimHash::EDGE_INHIBITION
        } else {
            SimHash::EDGE_REPRESENTATION
        };

        // 处理正向边
        {
            let edges = self.ontology_graph.entry(src).or_default();
            if let Some(edge) = edges.iter_mut().find(|e| e.target_node_id == tgt) {
                // [LTD 机制] 被动强化 (Hebbian Learning)
                edge.connection_strength = edge.connection_strength.saturating_add(quantized / 2).max(quantized);
                // 更新类型
                edge.edge_type = edge_type;
            } else {
                edges.push(GraphEdge {
                    target_node_id: tgt,
                    connection_strength: quantized,
                    edge_type,
                });
            }
        }
        
        // 处理反向边
        // 1. Equality (Type 1): 强制双向，表示 A==B 且 B==A
        // 2. Inhibition (Type 255): 强制双向，表示 A互斥B 且 B互斥A
        // 3. Representation (Type 0): 默认单向 (Directed)，因为"看到B想到A"不代表"看到A一定想到B"
        //    (除非业务层显式要求双向，否则底层只存单向)
        if edge_type == SimHash::EDGE_EQUALITY || edge_type == SimHash::EDGE_INHIBITION {
            let rev_edges = self.ontology_graph.entry(tgt).or_default();
            if let Some(edge) = rev_edges.iter_mut().find(|e| e.target_node_id == src) {
                // [LTD 机制] 被动强化
                edge.connection_strength = edge.connection_strength.saturating_add(quantized / 2).max(quantized);
                edge.edge_type = edge_type;
            } else {
                rev_edges.push(GraphEdge {
                    target_node_id: src,
                    connection_strength: quantized,
                    edge_type,
                });
            }
        }
    }

    // ========================================================================
    // 动态剪枝 (LTD: Long-Term Depression)
    // ========================================================================

    /// 执行全局衰减与物理剪枝
    /// decay_rate: 衰减比率 (0.0 - 1.0)，建议 0.95
    /// threshold: 剪枝阈值 (0 - 65535)，建议 3276 (0.05)
    pub fn apply_global_decay_and_pruning(&mut self, decay_rate: f32, threshold: u16) -> usize {
        let mut pruned_count = 0;
        
        // 遍历整个 Ontology 图谱
        for edges in self.ontology_graph.values_mut() {
            // 1. 全局熵增 (Entropy Increase)
            for edge in edges.iter_mut() {
                let current = edge.connection_strength as f32;
                edge.connection_strength = (current * decay_rate) as u16;
            }
            
            // 2. 物理断裂 (Pruning)
            let before_len = edges.len();
            edges.retain(|e| e.connection_strength > threshold);
            let after_len = edges.len();
            
            pruned_count += before_len - after_len;
        }
        
        if pruned_count > 0 {
            println!("[PEDSA Memory] Pruning executed: {} synapses disconnected.", pruned_count);
        }
        
        pruned_count
    }

    fn get_or_create_feature(&mut self, word: &str) -> i64 {
        let word_lower = word.to_lowercase();
        
        // 停用词检查 (同步 add_feature 中的列表)
        let stopwords = [
            // 中文虚词
            "的", "是", "了", "在", "我", "你", "他", "她", "它", "们", "这", "那", "都", "和", "并", "且",
            "也", "就", "着", "吧", "吗", "呢", "啊", "呀", "呜", "哎", "哼", "呸", "喽",
            // English Prepositions
            "a", "an", "the", "about", "above", "across", "after", "against", "along", "among", "around", "at", 
            "before", "behind", "below", "beneath", "beside", "between", "beyond", "but", "by", "despite", "down", 
            "during", "except", "for", "from", "in", "inside", "into", "like", "near", "of", "off", "on", "onto", 
            "out", "outside", "over", "past", "since", "through", "throughout", "till", "to", "toward", "under", 
            "underneath", "until", "up", "upon", "with", "within", "without",
            // English Pronouns
            "i", "me", "my", "mine", "we", "us", "our", "ours", "you", "your", "yours", "he", "him", "his", 
            "she", "her", "hers", "it", "its", "they", "them", "their", "theirs", "this", "that", "these", "those", 
            "who", "whom", "whose", "which", "what", "each", "every", "either", "neither", "some", "any", "no", 
            "none", "both", "few", "many", "other", "another",
            // English Auxiliaries
            "am", "is", "are", "was", "were", "be", "being", "been", "have", "has", "had", "do", "does", "did", 
            "shall", "will", "should", "would", "may", "might", "must", "can", "could",
            // English Conjunctions & Others
            "and", "or", "so", "nor", "yet", "although", "because", "unless", "while", "where", "when", "how", "whether"
        ];
        if stopwords.contains(&word_lower.as_str()) {
            return -1; // 返回非法 ID 表示该词被屏蔽
        }

        if let Some(&id) = self.keyword_to_node.get(&word_lower) {
            id
        } else {
            let mut s = XxHash64::with_seed(0);
            word_lower.hash(&mut s);
            let id = (s.finish() as i64).abs();
            self.add_feature(id, &word_lower);
            id
        }
    }

    /// 建立双向时序链表 (Temporal Backbone)
    pub fn build_temporal_backbone(&mut self) {
        println!("⏳ 正在构建时序脊梁 (Temporal Backbone)...");
        
        // 1. 收集所有 Event 节点并按时间戳排序
        let mut events: Vec<(i64, u64)> = self.nodes.values()
            .filter(|n| n.node_type == NodeType::Event)
            .map(|n| (n.id, n.timestamp))
            .collect();
        
        // 如果没有时间戳，暂时用 ID 模拟顺序（仅供测试）
        // 在真实场景中，timestamp 应该是必填的
        events.sort_by(|a, b| {
            if a.1 != b.1 {
                a.1.cmp(&b.1)
            } else {
                a.0.cmp(&b.0) // 时间戳相同则按 ID 排序
            }
        });

        // 2. 串联双向链表
        for i in 0..events.len() {
            let (curr_id, _) = events[i];
            
            if i > 0 {
                let (prev_id, _) = events[i-1];
                if let Some(node) = self.nodes.get_mut(&curr_id) {
                    node.prev_event = Some(prev_id);
                }
            }
            
            if i < events.len() - 1 {
                let (next_id, _) = events[i+1];
                if let Some(node) = self.nodes.get_mut(&curr_id) {
                    node.next_event = Some(next_id);
                }
            }
        }
        println!("✅ 时序脊梁构建完成，已串联 {} 个事件节点。", events.len());
    }

    // Data loading functions removed for WASM core


    /// 编译 AC 自动机
    pub fn compile(&mut self) {
        // 只对 Feature 节点编译 AC 自动机
        let mut keywords: Vec<_> = self.nodes.values()
            .filter(|n| n.node_type == NodeType::Feature)
            .map(|n| n.content.clone())
            .collect();
        
        // V2: 关键优化 - 按长度降序排序，确保优先匹配长词 (如 "分布式编译" 优于 "分布式")
        keywords.sort_by(|a, b| b.len().cmp(&a.len()));

        if !keywords.is_empty() {
            self.ac_matcher = Some(AhoCorasickBuilder::new()
                .match_kind(MatchKind::LeftmostLongest)
                .build(&keywords)
                .unwrap());
            self.feature_keywords = keywords;
        }

        // V2: 计算节点入度 (In-degree) 以用于反向抑制
        self.in_degrees.clear();
        // 统计 Memory Graph
        for edges in self.graph.values() {
            for edge in edges {
                *self.in_degrees.entry(edge.target_node_id).or_default() += 1;
            }
        }
        // 统计 Ontology Graph
        for edges in self.ontology_graph.values() {
            for edge in edges {
                *self.in_degrees.entry(edge.target_node_id).or_default() += 1;
            }
        }

        // V2: 构建时空索引 (Spatio-Temporal Index) 与 情感索引 (Affective Index)
        self.temporal_index.clear();
        self.affective_index.clear();

        for node in self.nodes.values() {
            if node.node_type == NodeType::Event {
                // 时空索引
                let st_hash = ((node.fingerprint & SimHash::MASK_TEMPORAL) >> 32) as u16;
                if st_hash != 0 {
                    self.temporal_index.entry(st_hash).or_default().push(node.id);
                }

                // 情感索引
                let emotion_hash = ((node.fingerprint & SimHash::MASK_AFFECTIVE) >> 48) as u8;
                if emotion_hash != 0 {
                    // 对于每个设置了的位，都加入到对应的索引桶中 (支持混合情感)
                    for i in 0..8 {
                        if (emotion_hash & (1 << i)) != 0 {
                            self.affective_index.entry(1 << i).or_default().push(node.id);
                        }
                    }
                }
            }
        }

        println!("🚀 引擎编译完成：{} 个特征锚点, {} 个总节点, {} 个时空桶, {} 个情感维度", 
            self.feature_keywords.len(), self.nodes.len(), self.temporal_index.len(), self.affective_index.len());
    }

    // Test data generation removed

    /// 执行多级检索 (V2: 增加能量控制机制 + 分区时空共振)
    /// 第四阶段：双轨检索（理性 + 混沌）
    /// 
    /// # 参数
    /// * `query` - 查询字符串。
    /// * `ref_time` - 用于相对时间解析的参考时间戳。
    /// * `chaos_level` - 0.0 到 1.0 之间的浮点数。
    ///   - 0.0: 纯理性检索（确定性）。
    ///   - 1.0: 纯混沌检索（高随机性/创造性）。
    ///   - 中间值则混合两者的得分。
    pub fn retrieve(&self, query: &str, ref_time: u64, chaos_level: f32) -> Vec<(i64, f32)> {
        let mut activated_keywords = AHashMap::new();
        let query_lower = query.to_lowercase();
        // V2: 使用智能指纹生成，提取时空/情感特征
        // 传入 ref_time 以支持相对时间解析
        let query_fp = SimHash::compute_for_query(&query_lower, ref_time);

        // --- Step 1: 特征共振 (AC Matcher) - 极快 ---
        if let Some(matcher) = &self.ac_matcher {
            for mat in matcher.find_iter(&query_lower) {
                let kw = &self.feature_keywords[mat.pattern()];
                if let Some(&node_id) = self.keyword_to_node.get(kw) {
                    activated_keywords.insert(node_id, 1.0);
                }
            }
        }

        // --- Step 1.5: 时间共振 (Temporal Resonance) ---
        // 如果 Query 包含时间信息，直接从索引中召回候选节点 (Bypass Semantic Matching)
        if (query_fp & SimHash::MASK_TEMPORAL) != 0 {
            let st_hash = ((query_fp & SimHash::MASK_TEMPORAL) >> 32) as u16;
            if let Some(candidates) = self.temporal_index.get(&st_hash) {
                // 将这些候选节点加入初始激活集合
                // 注意：这些通常是 Event 节点，它们将直接作为种子进入后续流程
                for &id in candidates {
                    let entry = activated_keywords.entry(id).or_insert(0.0);
                    // 初始共振能量设为 0.6 (低于完全匹配的 1.0)
                    if *entry < 0.6 { *entry = 0.6; }
                }
            }
        }

        // --- Step 1.6: 情感共振 (Affective Resonance) ---
        // 如果 Query 包含情感信息，从情感索引中召回候选节点
        if (query_fp & SimHash::MASK_AFFECTIVE) != 0 {
            let emotion_hash = ((query_fp & SimHash::MASK_AFFECTIVE) >> 48) as u8;
            for i in 0..8 {
                if (emotion_hash & (1 << i)) != 0 {
                    if let Some(candidates) = self.affective_index.get(&(1 << i)) {
                         for &id in candidates {
                            let entry = activated_keywords.entry(id).or_insert(0.0);
                            // 情感共振能量设为 0.7 (比较强烈，因为是内心的直接投射)
                            if *entry < 0.7 { *entry = 0.7; }
                        }
                    }
                }
            }
        }

        // --- Step 2: 第一数据库 (Ontology 定义库) 扩散 ---
        let mut ontology_expanded = activated_keywords.clone();
        for (&node_id, &score) in &activated_keywords {
            if let Some(neighbors) = self.ontology_graph.get(&node_id) {
                for edge in neighbors {
                    let weight = edge.connection_strength as f32 / 65535.0;
                    
                    // V2: 反向抑制 (Inverse Inhibition) - 降低泛化词权重
                    let degree = self.in_degrees.get(&edge.target_node_id).unwrap_or(&1);
                    // log10(1)=0 -> 1.0; log10(10)=1 -> 0.5; log10(100)=2 -> 0.33
                    let inhibition_factor = 1.0 / (1.0 + (*degree as f32).log10()); 
                    
                    // V3.5: Typed Edge Logic
                    // 1. EQUALITY (1): 零损耗，无视反向抑制，能量直接传递 (max)
                    // 2. INHIBITION (255): 负能量扣减
                    // 3. REPRESENTATION (0): 正常衰减
                    
                    if edge.edge_type == SimHash::EDGE_EQUALITY {
                        // 等价传递：直接取源节点能量，不打折
                        let entry = ontology_expanded.entry(edge.target_node_id).or_insert(0.0);
                        if score > *entry {
                             *entry = score;
                        }
                        continue;
                    }
                    
                    // 计算基础能量 (含权重和反向抑制)
                    let energy = score * weight * 0.95 * inhibition_factor;
                    
                    if edge.edge_type == SimHash::EDGE_INHIBITION {
                        // 抑制传递：扣减能量
                        // 注意：如果目标节点尚未激活 (0.0)，扣减后为负，之后会被截断
                        let entry = ontology_expanded.entry(edge.target_node_id).or_insert(0.0);
                        *entry -= energy; 
                    } else {
                        // 普通传递
                        // V2: 硬阈值剪枝 (Hard Squelch)
                        if energy < 0.05 { continue; }
                        
                        let entry = ontology_expanded.entry(edge.target_node_id).or_insert(0.0);
                        *entry = (*entry).max(energy);
                    }
                }
            }
        }

        // --- Step 3: 能量归一化 (Energy Normalization) ---
        // 防止扩散到 Memory 库前能量过大
        let total_energy: f32 = ontology_expanded.values().sum();
        if total_energy > 10.0 {
            let factor = 10.0 / total_energy;
            for val in ontology_expanded.values_mut() {
                *val *= factor;
            }
        }

        // --- Step 4: 第二数据库 (Memory 记忆库) 扩散 ---
        let final_scores = ontology_expanded.clone();
        let decay = 0.85; // 提高衰减系数，增加信号传播距离
        let layer_limit = 5000; 

        // 侧向抑制：选出能量最高的 Top-K 种子进行扩散
        let mut seeds: Vec<(&i64, &f32)> = ontology_expanded.iter().collect();
        // 排序
        seeds.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap());
        // 截断 (Lateral Inhibition)
        if seeds.len() > layer_limit {
            seeds.truncate(layer_limit);
        }

        let increments: AHashMap<i64, f32> = seeds
            .into_iter()
            .fold(
                AHashMap::new(),
                |mut acc: AHashMap<i64, f32>, (&node_id, &score)| {
                    if let Some(neighbors) = self.graph.get(&node_id) {
                        for edge in neighbors {
                            let weight = edge.connection_strength as f32 / 65535.0;
                            
                            // V2: 反向抑制 (Memory 层)
                            let degree = self.in_degrees.get(&edge.target_node_id).unwrap_or(&1);
                            let inhibition_factor = 1.0 / (1.0 + (*degree as f32).log10());

                            let energy = score * weight * decay * inhibition_factor;
                            
                            // Memory 层阈值稍低，保留更多细节
                            if energy < 0.01 { continue; } 

                            *acc.entry(edge.target_node_id).or_default() += energy;
                        }
                    }
                    acc
                },
            );

        // --- Step 5: 结果整合与局部 SimHash 细化 ---
        let mut results_map = final_scores;
        for (id, energy) in increments {
            *results_map.entry(id).or_default() += energy;
        }

        let mut results: Vec<_> = results_map
            .into_iter()
            .filter(|(id, _)| self.nodes.get(id).map_or(false, |n| n.node_type == NodeType::Event))
            .collect();

        // 局部细化：只对初步排序前 50 的结果进行 SimHash 修正
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        for i in 0..results.len().min(50) {
            let (id, score) = &mut results[i];
            if let Some(node) = self.nodes.get(id) {
                // V2: 分区多模态共振逻辑
                // 1. 语义共振 (基础)
                let semantic_sim = SimHash::similarity_weighted(query_fp, node.fingerprint, SimHash::MASK_SEMANTIC);
                let mut resonance_boost = semantic_sim * 0.6; // 显著提升语义共振权重
                
                // 2. 时间共振 (Temporal Resonance)
                // 只有当 Query 显式包含时空信息时 (mask 区域非零)，才进行加权
                if (query_fp & SimHash::MASK_TEMPORAL) != 0 {
                    let temporal_sim = SimHash::similarity_weighted(query_fp, node.fingerprint, SimHash::MASK_TEMPORAL);
                    // 时空匹配给予高权重 (0.5)，模拟“瞬间回忆”
                    resonance_boost += temporal_sim * 0.5;
                }

                // 3. 情感共鸣 (Affective Resonance) - Bitwise AND
                if (query_fp & SimHash::MASK_AFFECTIVE) != 0 {
                    let query_emotions = (query_fp & SimHash::MASK_AFFECTIVE) >> 48;
                    let node_emotions = (node.fingerprint & SimHash::MASK_AFFECTIVE) >> 48;
                    
                    // 位运算共振：只要有共同的情感位被激活，就产生强烈共鸣
                    if (query_emotions & node_emotions) != 0 {
                        resonance_boost += 0.6; 
                    }
                }

                // 4. 类型对齐 (Entity Type Alignment)
                if (query_fp & SimHash::MASK_TYPE) != 0 {
                    let type_sim = SimHash::similarity_weighted(query_fp, node.fingerprint, SimHash::MASK_TYPE);
                    // 类型匹配给予极高的修正权重 (0.8)，因为类型不对通常意味着完全无关
                    resonance_boost += type_sim * 0.8;
                }

                // 5. 艾宾浩斯记忆衰减 (Ebbinghaus Decay)
                // Formula: Energy = Base * e^(-t/tau)
                // 使用传入的 ref_time 作为衰减基准时间 (如果为 0 则默认不衰减)
                let current_decay_time = if ref_time > 0 { ref_time } else { 1777593600 }; 
                let tau = 31536000.0; // 延长记忆半衰期
                
                if node.timestamp > 0 && node.timestamp < current_decay_time {
                    let delta_t = (current_decay_time - node.timestamp) as f32;
                    let decay_factor = (-delta_t / tau).exp();
                    
                    // 降低衰减总权重：限制衰减系数最低为 0.8 (旧记忆最多损失 20% 能量)
                    let final_decay = decay_factor.max(0.8);
                    *score *= final_decay;
                }

                *score += resonance_boost;
            }
        }

        // --- 第四阶段：混沌激活 (双轨并行) ---
        if chaos_level > 0.0 {
            if let Some((query_fp, query_vec_f16)) = self.calculate_chaos(query) {
                let mut combined_results = AHashMap::new();
                
                // 将理性检索结果存入 map (按 1 - chaos_level 加权)
                for (id, score) in results.iter() {
                    combined_results.insert(*id, *score * (1.0 - chaos_level));
                }

                // --- 1. L1 粗排 (1-bit 量化) ---
                // 计算所有事件节点的汉明距离
                // 保留前 5000 个候选者
                
                // SoA 扫描
                let mut candidates: Vec<(usize, u32)> = Vec::with_capacity(self.chaos_store.ids.len() / 10);

                for (idx, &node_fp) in self.chaos_store.fingerprints.iter().enumerate() {
                    // 汉明距离：异或 -> 位计数 (不同位的数量)
                    let distance = (query_fp ^ node_fp).count_ones();
                    
                    // 阈值剪枝：最大距离 64 (总共 128 位) 意味着相关性几乎为 0
                    if distance < 64 {
                        candidates.push((idx, distance));
                    }
                }

                // 按距离排序 (升序)
                candidates.sort_unstable_by_key(|k| k.1);
                
                // 截取前 5000 个
                if candidates.len() > 5000 {
                    candidates.truncate(5000);
                }

                // --- 2. L2 精排 (f16 余弦相似度) ---
                let q_norm: f32 = query_vec_f16.iter().map(|x| x.to_f32().powi(2)).sum::<f32>().sqrt();
                
                for (idx, _dist) in candidates {
                    let node_id = self.chaos_store.ids[idx];
                    let chaos_vector = &self.chaos_store.vectors[idx];

                    if !chaos_vector.is_empty() {
                        let dot: f32 = query_vec_f16.iter().zip(chaos_vector).map(|(a, b)| a.to_f32() * b.to_f32()).sum();
                        let n_norm: f32 = chaos_vector.iter().map(|x| x.to_f32().powi(2)).sum::<f32>().sqrt();
                        
                        if q_norm > 0.0 && n_norm > 0.0 {
                            let sim = dot / (q_norm * n_norm);
                            
                            // 非线性激活 (阈值 > 0.95, 最大系数 0.15)
                            if sim > 0.95 {
                                let normalized = (sim - 0.95) / 0.05;
                                let chaos_score = normalized * 0.15;
                                let weighted_chaos = chaos_score * chaos_level;
                                
                                *combined_results.entry(node_id).or_default() += weighted_chaos;
                            }
                        }
                    }
                }
                
                // 转换回排序后的向量
                let mut final_results: Vec<_> = combined_results.into_iter().collect();
                final_results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
                return final_results;
            }
        }
        
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        results
    }

    /// 模拟 LLM 维护过程：对话后分析关键词关联并更新 Ontology
    /// V2: 逻辑仲裁触发器 (Logical Arbitration Trigger)
    /// 当 action 为 "replace" 时调用此函数
    /// 返回值：需要发送给 LLM2 (仲裁者) 的 Context (局部子图文本)
    pub fn trigger_arbitration(&self, source: &str) -> Option<String> {
        let src_id = self.keyword_to_node.get(&source.to_lowercase())?;
        
        // 提取 1-hop 子图
        // 格式: "Source -> Target (Strength: 0.x)"
        let mut context_lines = Vec::new();
        if let Some(edges) = self.ontology_graph.get(src_id) {
            for edge in edges {
                if let Some(target_node) = self.nodes.get(&edge.target_node_id) {
                    let strength = edge.connection_strength as f32 / 65535.0;
                    context_lines.push(format!("{} -> {} (Strength: {:.2})", 
                        source, target_node.content, strength));
                }
            }
        }
        
        if context_lines.is_empty() {
            return None;
        }
        
        Some(context_lines.join("\n"))
    }

    /// V2: 执行仲裁结果 (Apply Arbitration)
    /// 根据 LLM2 的指示删除指定关联
    pub fn apply_arbitration(&mut self, source: &str, delete_targets: Vec<String>) {
        if let Some(&src_id) = self.keyword_to_node.get(&source.to_lowercase()) {
            if let Some(edges) = self.ontology_graph.get_mut(&src_id) {
                let initial_len = edges.len();
                
                // 过滤掉需要删除的目标
                // 注意：这里需要通过 target content 反查 id，或者遍历 edges 检查 content
                // 为了性能，我们先收集要删除的 target_ids
                let mut target_ids_to_remove = Vec::new();
                
                for target_str in delete_targets {
                    if let Some(&tgt_id) = self.keyword_to_node.get(&target_str.to_lowercase()) {
                        target_ids_to_remove.push(tgt_id);
                    }
                }
                
                if !target_ids_to_remove.is_empty() {
                    edges.retain(|e| !target_ids_to_remove.contains(&e.target_node_id));
                    let removed_count = initial_len - edges.len();
                    if removed_count > 0 {
                        println!("✂️ [Arbitration] 已从 '{}' 移除 {} 条过时关联", source, removed_count);
                    }
                }
            }
        }
    }

    pub fn maintain_ontology(&mut self, source: &str, target: &str, relation_type: &str, strength: f32) {
        println!("🤖 [LLM Maintenance] 发现新关联: {} -> {} (type: {}, strength: {})", 
                 source, target, relation_type, strength);
        
        let src_id = self.get_or_create_feature(source);
        let tgt_id = self.get_or_create_feature(target);
        
        let strength_u16 = (strength * 65535.0) as u16;
        
        // 确定边类型 (简化为三种核心逻辑)
        let edge_type = match relation_type.to_lowercase().as_str() {
            "equality" | "equal" => SimHash::EDGE_EQUALITY,
            "inhibition" | "conflict" => SimHash::EDGE_INHIBITION,
            _ => SimHash::EDGE_REPRESENTATION,
        };

        // 处理正向边
        {
            let edges = self.ontology_graph.entry(src_id).or_insert(SmallVec::new());
            if let Some(existing) = edges.iter_mut().find(|e| e.target_node_id == tgt_id) {
                // [LTD 机制] 被动强化 (Hebbian Learning)
                existing.connection_strength = existing.connection_strength.saturating_add(strength_u16 / 2).max(strength_u16);
                // 更新类型
                existing.edge_type = edge_type;
            } else {
                edges.push(GraphEdge {
                    target_node_id: tgt_id,
                    connection_strength: strength_u16,
                    edge_type,
                });
            }
        }
        
        // 处理反向边
        // 1. Equality (Type 1): 强制双向，表示 A==B 且 B==A
        // 2. Inhibition (Type 255): 强制双向，表示 A互斥B 且 B互斥A
        // 3. Representation (Type 0): 默认单向 (Directed)，因为"看到B想到A"不代表"看到A一定想到B"
        //    (除非业务层显式要求双向，否则底层只存单向)
        if edge_type == SimHash::EDGE_EQUALITY || edge_type == SimHash::EDGE_INHIBITION {
            let rev_edges = self.ontology_graph.entry(tgt_id).or_insert(SmallVec::new());
            if let Some(existing) = rev_edges.iter_mut().find(|e| e.target_node_id == src_id) {
                // [LTD 机制] 被动强化
                existing.connection_strength = existing.connection_strength.saturating_add(strength_u16 / 2).max(strength_u16);
                existing.edge_type = edge_type;
            } else {
                rev_edges.push(GraphEdge {
                    target_node_id: src_id,
                    connection_strength: strength_u16,
                    edge_type,
                });
            }
        }
    }

    /// V2: Ontology 剪枝机制 (Noise Pruning)
    /// 1. 全局低权清理: 删除 strength < 0.1 的边
    /// 2. 局部容量限制: 每个节点最多保留 100 条边
    /// 建议调用时机: 每次保存前，或每天一次
    pub fn prune_ontology(&mut self) {
        println!("🧹 [Pruning] 开始执行 Ontology 剪枝...");
        let threshold = (0.05 * 65535.0) as u16; // 阈值 0.05
        let max_edges = 100;
        let mut total_removed = 0;
        
        // 调用新的全局衰减与剪枝逻辑
        // 衰减 1% (0.99)
        total_removed += self.apply_global_decay_and_pruning(0.99, threshold);

        for (_node_id, edges) in self.ontology_graph.iter_mut() {
            let initial_len = edges.len();
            
            // 1. 全局低权清理 (已由 apply_global_decay_and_pruning 处理)
            // edges.retain(|e| e.connection_strength >= threshold);
            
            // 2. 局部容量限制
            if edges.len() > max_edges {
                // 按强度降序排序
                edges.sort_by(|a, b| b.connection_strength.cmp(&a.connection_strength));
                // 截断
                edges.truncate(max_edges);
            }
            
            total_removed += initial_len - edges.len();
        }
        
        println!("✨ [Pruning] 剪枝完成，共清理了 {} 条低价值/溢出关联。", total_removed);
    }

    /// 统一维护接口 (Unified Maintenance Interface)
    /// 自动处理 upsert/replace 逻辑
    /// 返回值: Option<String> - 如果需要仲裁 (Replace 模式)，返回 1-hop 局部子图上下文；否则返回 None
    pub fn execute_maintenance(&mut self, action: &str, source: &str, target: &str, relation_type: &str, strength: f32, _reason: &str) -> Option<String> {
        match action.to_lowercase().as_str() {
            "upsert" => {
                // Upsert: 直接维护本体关联
                self.maintain_ontology(source, target, relation_type, strength);
                None
            },
            "replace" => {
                // Replace: 先应用新变更，然后触发仲裁
                // 这样 LLM2 能看到冲突的全貌 (旧 + 新)
                self.maintain_ontology(source, target, relation_type, strength);
                self.trigger_arbitration(source)
            },
            _ => {
                println!("⚠️ 未知操作: {} (Source: {})", action, source);
                None
            }
        }
    }
}

    // Benchmark functions removed


// Main function removed for WASM compatibility
