use std::fs::File;
use std::io::{self, Read, Write};
#[cfg(not(target_arch = "wasm32"))]
use std::io::BufReader;
use std::path::Path;
use ahash::AHashMap;

/// PEDSA Static Embedding Model
/// 
/// 专为 PEDSA 设计的轻量级静态向量模型加载器。
/// 
/// # 文件格式 (.pedsa_vec)
/// - Magic: "PEDSA_VEC\0" (10 bytes)
/// - Version: u16 (2 bytes)
/// - Dimension: u16 (2 bytes)
/// - Vocab Size: u32 (4 bytes)
/// - Data: [ (WordLen: u8, Word: [u8], Vector: [f32; Dim]), ... ]
pub struct StaticModel {
    pub dimension: usize,
    pub vocab: AHashMap<String, Vec<f32>>,
}

impl StaticModel {
    /// 创建一个新的空模型
    pub fn new(dimension: usize) -> Self {
        Self {
            dimension,
            vocab: AHashMap::new(),
        }
    }

    /// 从文件加载模型
    #[cfg(not(target_arch = "wasm32"))]
    pub fn load<P: AsRef<Path>>(path: P) -> io::Result<Self> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        Self::load_from_reader(&mut reader)
    }

    /// 从字节数组加载模型 (WASM 兼容)
    pub fn load_from_bytes(data: &[u8]) -> io::Result<Self> {
        let mut reader = io::Cursor::new(data);
        Self::load_from_reader(&mut reader)
    }

    /// 通用加载逻辑
    pub fn load_from_reader<R: Read>(reader: &mut R) -> io::Result<Self> {
        // 1. Read Header
        let mut magic = [0u8; 10];
        reader.read_exact(&mut magic)?;
        if &magic != b"PEDSA_VEC\0" {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "Invalid magic number"));
        }

        let mut version_bytes = [0u8; 2];
        reader.read_exact(&mut version_bytes)?;
        let _version = u16::from_le_bytes(version_bytes); // 目前忽略版本

        let mut dim_bytes = [0u8; 2];
        reader.read_exact(&mut dim_bytes)?;
        let dimension = u16::from_le_bytes(dim_bytes) as usize;

        let mut vocab_size_bytes = [0u8; 4];
        reader.read_exact(&mut vocab_size_bytes)?;
        let vocab_size = u32::from_le_bytes(vocab_size_bytes) as usize;

        let mut model = Self::new(dimension);
        model.vocab.reserve(vocab_size);

        // 2. Read Data
        // 临时 buffer 用于读取向量数据
        let mut vec_buffer = vec![0u8; dimension * 4]; 

        for _ in 0..vocab_size {
            // Read Word Length
            let mut len_buf = [0u8; 1];
            reader.read_exact(&mut len_buf)?;
            let len = len_buf[0] as usize;

            // Read Word
            let mut word_buf = vec![0u8; len];
            reader.read_exact(&mut word_buf)?;
            let word = String::from_utf8(word_buf)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

            // Read Vector
            reader.read_exact(&mut vec_buffer)?;
            let vector: Vec<f32> = vec_buffer
                .chunks_exact(4)
                .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
                .collect();

            model.vocab.insert(word, vector);
        }

        Ok(model)
    }

    /// 保存模型到文件 (用于生成测试数据或转换模型)
    pub fn save<P: AsRef<Path>>(&self, path: P) -> io::Result<()> {
        let file = File::create(path)?;
        let mut writer = std::io::BufWriter::new(file);

        // Header
        writer.write_all(b"PEDSA_VEC\0")?;
        writer.write_all(&1u16.to_le_bytes())?; // Version 1
        writer.write_all(&(self.dimension as u16).to_le_bytes())?;
        writer.write_all(&(self.vocab.len() as u32).to_le_bytes())?;

        // Data
        for (word, vec) in &self.vocab {
            let word_bytes = word.as_bytes();
            if word_bytes.len() > 255 {
                continue; // Skip words too long
            }
            writer.write_all(&[word_bytes.len() as u8])?;
            writer.write_all(word_bytes)?;
            
            for val in vec {
                writer.write_all(&val.to_le_bytes())?;
            }
        }

        writer.flush()?;
        Ok(())
    }

    /// 简单的加权平均向量化
    /// 支持中文单字粒度回退 (Char-level Fallback)
    pub fn vectorize(&self, text: &str) -> Option<Vec<f32>> {
        self.vectorize_weighted(text, &[])
    }

    /// 支持加权 (Weighted) 的向量化
    /// weighted_ranges: [(start_byte, end_byte, weight)]
    pub fn vectorize_weighted(&self, text: &str, weighted_ranges: &[(usize, usize, f32)]) -> Option<Vec<f32>> {
        let mut final_vec = vec![0.0; self.dimension];
        let mut total_weight = 0.0;
        let text_start = text.as_ptr() as usize;

        for token in text.split_whitespace() {
            let token_offset = token.as_ptr() as usize - text_start;
            let token_len = token.len();
            let token_range = token_offset..(token_offset + token_len);

            // Determine weight for this token (max of overlapping ranges)
            let mut weight = 1.0;
            for (r_start, r_end, w) in weighted_ranges {
                // Check overlap: start < r_end && end > r_start
                if token_range.start < *r_end && token_range.end > *r_start {
                    if *w > weight { weight = *w; }
                }
            }

            // 1. Try whole token match
            if let Some(vec) = self.vocab.get(token) {
                for (i, val) in vec.iter().enumerate() {
                    final_vec[i] += val * weight;
                }
                total_weight += weight;
            } else {
                // 2. Fallback: Try character-level match
                for (char_idx, char) in token.char_indices() {
                    let char_offset = token_offset + char_idx;
                    let char_len = char.len_utf8();
                    let char_range = char_offset..(char_offset + char_len);
                    
                    let mut char_weight = 1.0;
                    for (r_start, r_end, w) in weighted_ranges {
                        if char_range.start < *r_end && char_range.end > *r_start {
                            if *w > char_weight { char_weight = *w; }
                        }
                    }

                    let char_str = char.to_string();
                    if let Some(vec) = self.vocab.get(&char_str) {
                        for (i, val) in vec.iter().enumerate() {
                            final_vec[i] += val * char_weight;
                        }
                        total_weight += char_weight;
                    }
                }
            }
        }

        if total_weight == 0.0 {
            return None;
        }

        // Normalize (Weighted Mean)
        for val in &mut final_vec {
            *val /= total_weight;
        }

        Some(final_vec)
    }
    
    /// 计算两个向量的余弦相似度
    pub fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f32 {
        if v1.len() != v2.len() {
            return 0.0;
        }

        let mut dot_product = 0.0;
        let mut norm_v1 = 0.0;
        let mut norm_v2 = 0.0;

        // 手动 SIMD 优化可能性：使用 packed_simd 或 portable_simd
        // 目前编译器自动向量化应该已经不错了
        for i in 0..v1.len() {
            dot_product += v1[i] * v2[i];
            norm_v1 += v1[i] * v1[i];
            norm_v2 += v2[i] * v2[i];
        }

        if norm_v1 == 0.0 || norm_v2 == 0.0 {
            return 0.0;
        }

        dot_product / (norm_v1.sqrt() * norm_v2.sqrt())
    }
}

// Tests removed for WASM compatibility
