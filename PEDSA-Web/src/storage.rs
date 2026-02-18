use std::fs::File;
use std::io::{self, Write, BufWriter};
use std::path::Path;
use memmap2::Mmap;
use bytemuck::{Pod, Zeroable};
use half::f16;

/// 索引文件头 (V3 SoA 布局)
#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct IndexHeader {
    pub magic: u64,       // "PEDSA_V3"
    pub version: u32,     // 2 (SoA)
    pub node_count: u32,  // 节点总数
    pub simhash_offset: u64,
    pub id_offset: u64,
    pub metadata_offset: u64, // 包含 data_offset 和 data_len 的结构体数组
    pub chaos_fingerprint_offset: u64, // Chaos Fingerprint (u64)
    pub chaos_vector_offset: u64,      // Chaos Vector (128 * f16)
}

/// 节点元数据 (冷索引部分)
#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct NodeMetadata {
    pub data_offset: u64,
    pub data_len: u32,
    pub node_type: u8,    // 0=Feature/Ontology, 1=Event
    pub _padding: [u8; 3],
}

pub struct StorageEngine {
    // 保持 index_mmap 的引用以防止内存释放
    #[allow(dead_code)]
    index_mmap: Mmap,
    data_mmap: Mmap,
    header: IndexHeader,
    simhashes: &'static [u64],
    ids: &'static [i64],
    metadata: &'static [NodeMetadata],
    chaos_fingerprints: &'static [u128],
    chaos_vectors: &'static [f16],
    
    // 热插入缓冲区 (LSM-tree 思想)
    buffer_simhashes: Vec<u64>,
    buffer_ids: Vec<i64>,
    buffer_texts: Vec<String>,
    buffer_node_types: Vec<u8>,
    buffer_chaos_fingerprints: Vec<u128>,
    buffer_chaos_vectors: Vec<f16>,
}

impl StorageEngine {
    pub fn new<P: AsRef<Path>>(index_path: P, data_path: P) -> io::Result<Self> {
        let index_file = File::open(index_path)?;
        let data_file = File::open(data_path)?;

        let index_mmap = unsafe { Mmap::map(&index_file)? };
        let data_mmap = unsafe { Mmap::map(&data_file)? };

        // 解析 Header
        let header_slice = &index_mmap[0..std::mem::size_of::<IndexHeader>()];
        let header: IndexHeader = *bytemuck::from_bytes(header_slice);

        // 解析 SoA 数组 (Zero-copy cast)
        let simhashes = unsafe {
            let ptr = index_mmap.as_ptr().add(header.simhash_offset as usize) as *const u64;
            std::slice::from_raw_parts(ptr, header.node_count as usize)
        };
        let ids = unsafe {
            let ptr = index_mmap.as_ptr().add(header.id_offset as usize) as *const i64;
            std::slice::from_raw_parts(ptr, header.node_count as usize)
        };
        let metadata = unsafe {
            let ptr = index_mmap.as_ptr().add(header.metadata_offset as usize) as *const NodeMetadata;
            std::slice::from_raw_parts(ptr, header.node_count as usize)
        };
        
        // Chaos Fields
        let chaos_fingerprints = unsafe {
            let ptr = index_mmap.as_ptr().add(header.chaos_fingerprint_offset as usize) as *const u128;
            std::slice::from_raw_parts(ptr, header.node_count as usize)
        };
        
        let chaos_vectors = unsafe {
            let ptr = index_mmap.as_ptr().add(header.chaos_vector_offset as usize) as *const f16;
            std::slice::from_raw_parts(ptr, (header.node_count as usize) * 128)
        };

        Ok(Self {
            index_mmap,
            data_mmap,
            header,
            simhashes,
            ids,
            metadata,
            chaos_fingerprints,
            chaos_vectors,
            buffer_simhashes: Vec::new(),
            buffer_ids: Vec::new(),
            buffer_texts: Vec::new(),
            buffer_node_types: Vec::new(),
            buffer_chaos_fingerprints: Vec::new(),
            buffer_chaos_vectors: Vec::new(),
        })
    }

    /// 热插入新节点
    pub fn insert_node(&mut self, id: i64, simhash: u64, text: String, node_type: u8, chaos_fp: u128, chaos_vec: &[f16]) {
        self.buffer_ids.push(id);
        self.buffer_simhashes.push(simhash);
        self.buffer_texts.push(text);
        self.buffer_node_types.push(node_type);
        self.buffer_chaos_fingerprints.push(chaos_fp);
        
        // Ensure chaos_vec is 128 dims, if not pad or truncate (or panic, but let's assume correct)
        if chaos_vec.len() == 128 {
             self.buffer_chaos_vectors.extend_from_slice(chaos_vec);
        } else {
             // Fallback for safety: push zeros
             self.buffer_chaos_vectors.extend(std::iter::repeat(f16::from_f32(0.0)).take(128));
        }
    }

    pub fn node_count(&self) -> usize {
        self.header.node_count as usize + self.buffer_ids.len()
    }

    pub fn get_id(&self, idx: usize) -> i64 {
        let disk_count = self.header.node_count as usize;
        if idx < disk_count {
            self.ids[idx]
        } else {
            self.buffer_ids[idx - disk_count]
        }
    }

    /// 从冷载体或缓冲区中读取文本
    pub fn get_node_text_by_idx(&self, idx: usize) -> &str {
        let disk_count = self.header.node_count as usize;
        if idx < disk_count {
            let meta = &self.metadata[idx];
            let start = meta.data_offset as usize;
            let end = start + meta.data_len as usize;
            let bytes = &self.data_mmap[start..end];
            std::str::from_utf8(bytes).unwrap_or("<invalid utf8>")
        } else {
            &self.buffer_texts[idx - disk_count]
        }
    }

    /// 获取 Chaos Fingerprint
    pub fn get_chaos_fingerprint_by_idx(&self, idx: usize) -> u128 {
        let disk_count = self.header.node_count as usize;
        if idx < disk_count {
            self.chaos_fingerprints[idx]
        } else {
            self.buffer_chaos_fingerprints[idx - disk_count]
        }
    }

    /// 获取 Chaos Vector (128 dims)
    pub fn get_chaos_vector_by_idx(&self, idx: usize) -> &[f16] {
        let disk_count = self.header.node_count as usize;
        if idx < disk_count {
            &self.chaos_vectors[idx * 128 .. (idx + 1) * 128]
        } else {
            let buf_idx = idx - disk_count;
            &self.buffer_chaos_vectors[buf_idx * 128 .. (buf_idx + 1) * 128]
        }
    }

    /// 执行原子化持久化：将缓冲区数据合并到磁盘并保存
    #[allow(dead_code)]
    pub fn persist<P: AsRef<Path>>(&mut self, index_path: P, data_path: P) -> io::Result<()> {
        if self.buffer_ids.is_empty() {
            return Ok(());
        }

        let temp_index_path = index_path.as_ref().with_extension("idx.tmp");
        let temp_data_path = data_path.as_ref().with_extension("dat.tmp");

        {
            let mut w_index = BufWriter::new(File::create(&temp_index_path)?);
            let mut w_data = BufWriter::new(File::create(&temp_data_path)?);

            let new_node_count = self.header.node_count as usize + self.buffer_ids.len();
            
            // 重新计算偏移量
            let header_size = std::mem::size_of::<IndexHeader>() as u64;
            let simhash_offset = align_to(header_size, 32);
            let simhash_size = (new_node_count * 8) as u64;
            
            let id_offset = align_to(simhash_offset + simhash_size, 32);
            let id_size = (new_node_count * 8) as u64;
            
            let metadata_offset = align_to(id_offset + id_size, 32);
            let metadata_size = (new_node_count * std::mem::size_of::<NodeMetadata>()) as u64;
            
            let chaos_fingerprint_offset = align_to(metadata_offset + metadata_size, 32);
            let chaos_fingerprint_size = (new_node_count * 16) as u64;
            
            let chaos_vector_offset = align_to(chaos_fingerprint_offset + chaos_fingerprint_size, 32);

            let new_header = IndexHeader {
                magic: self.header.magic,
                version: self.header.version,
                node_count: new_node_count as u32,
                simhash_offset,
                id_offset,
                metadata_offset,
                chaos_fingerprint_offset,
                chaos_vector_offset,
            };

            // 1. 写入 Header
            w_index.write_all(bytemuck::bytes_of(&new_header))?;

            // 2. 写入 SimHashes (Old + New)
            w_index.write_all(&vec![0u8; (simhash_offset - header_size) as usize])?;
            w_index.write_all(bytemuck::cast_slice(self.simhashes))?;
            w_index.write_all(bytemuck::cast_slice(&self.buffer_simhashes))?;

            // 3. 写入 IDs (Old + New)
            let current_pos = simhash_offset + simhash_size;
            w_index.write_all(&vec![0u8; (id_offset - current_pos) as usize])?;
            w_index.write_all(bytemuck::cast_slice(self.ids))?;
            w_index.write_all(bytemuck::cast_slice(&self.buffer_ids))?;

            // 4. 写入 Metadata
            let current_pos = id_offset + id_size;
            w_index.write_all(&vec![0u8; (metadata_offset - current_pos) as usize])?;
            
            // 写入旧 Metadata
            w_index.write_all(bytemuck::cast_slice(self.metadata))?;
            
            // 写入新 Metadata
            let mut current_data_offset = self.data_mmap.len() as u64;
            for i in 0..self.buffer_ids.len() {
                let bytes = self.buffer_texts[i].as_bytes();
                let meta = NodeMetadata {
                    data_offset: current_data_offset,
                    data_len: bytes.len() as u32,
                    node_type: self.buffer_node_types[i],
                    _padding: [0; 3],
                };
                w_index.write_all(bytemuck::bytes_of(&meta))?;
                current_data_offset += bytes.len() as u64;
            }

            // 5. 写入 Chaos Fingerprints
            let current_pos = metadata_offset + metadata_size;
            w_index.write_all(&vec![0u8; (chaos_fingerprint_offset - current_pos) as usize])?;
            w_index.write_all(bytemuck::cast_slice(self.chaos_fingerprints))?;
            w_index.write_all(bytemuck::cast_slice(&self.buffer_chaos_fingerprints))?;
            
            // 6. 写入 Chaos Vectors
            let current_pos = chaos_fingerprint_offset + chaos_fingerprint_size;
            w_index.write_all(&vec![0u8; (chaos_vector_offset - current_pos) as usize])?;
            w_index.write_all(bytemuck::cast_slice(self.chaos_vectors))?;
            w_index.write_all(bytemuck::cast_slice(&self.buffer_chaos_vectors))?;

            // 7. 写入 Data (to separate file)
            w_data.write_all(&self.data_mmap)?;
            for i in 0..self.buffer_ids.len() {
                 let bytes = self.buffer_texts[i].as_bytes();
                 w_data.write_all(bytes)?;
            }

            w_index.flush()?;
            w_data.flush()?;
        }

        // 原子化替换
        std::fs::rename(&temp_index_path, index_path.as_ref())?;
        std::fs::rename(&temp_data_path, data_path.as_ref())?;

        // 清空缓冲区
        self.buffer_ids.clear();
        self.buffer_simhashes.clear();
        self.buffer_texts.clear();
        self.buffer_node_types.clear();
        self.buffer_chaos_fingerprints.clear();
        self.buffer_chaos_vectors.clear();

        // 重新加载 mmap
        let new_engine = Self::new(index_path, data_path)?;
        *self = new_engine;

        Ok(())
    }

    /// 执行 Chaos Vector 相似度搜索 (Cosine Similarity)
    /// 返回 Top-K (index, score)
    pub fn scan_vector_top_k(&self, query_vec: &[f16], k: usize) -> Vec<(usize, f32)> {
        use rayon::prelude::*;
        use std::collections::BinaryHeap;
        use std::cmp::Ordering;

        #[derive(Copy, Clone, PartialEq)]
        struct ScoredNode(usize, f32);
        
        impl Eq for ScoredNode {}
        impl Ord for ScoredNode {
            fn cmp(&self, other: &Self) -> Ordering {
                // Min-heap for keeping top-K (smallest is top, we pop it if we find better)
                other.1.partial_cmp(&self.1).unwrap_or(Ordering::Equal)
            }
        }
        impl PartialOrd for ScoredNode {
             fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
                Some(self.cmp(other))
            }
        }

        let query_f32: Vec<f32> = query_vec.iter().map(|&x| x.to_f32()).collect();
        let query_norm = query_f32.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if query_norm == 0.0 { return vec![]; }

        let disk_count = self.header.node_count as usize;
        
        // Parallel scan over Disk
        let top_k_heap = self.chaos_vectors
            .par_chunks(128)
            .enumerate()
            .fold(
                || BinaryHeap::with_capacity(k + 1),
                |mut heap: BinaryHeap<ScoredNode>, (i, vec_data)| {
                    let mut dot = 0.0;
                    let mut norm_sq = 0.0;
                    // Manual unroll or loop
                    for (j, &val) in vec_data.iter().enumerate() {
                        let v = val.to_f32();
                        dot += v * query_f32[j];
                        norm_sq += v * v;
                    }
                    
                    let score = if norm_sq > 0.0 {
                         dot / (norm_sq.sqrt() * query_norm)
                    } else { 0.0 };

                    heap.push(ScoredNode(i, score));
                    if heap.len() > k {
                        heap.pop();
                    }
                    heap
                }
            )
            .reduce(
                || BinaryHeap::with_capacity(k + 1),
                |mut heap1, heap2| {
                    for item in heap2 {
                        heap1.push(item);
                        if heap1.len() > k {
                            heap1.pop();
                        }
                    }
                    heap1
                }
            );
            
        // Scan Buffer (Linear is fine as buffer is small)
        let mut final_heap = top_k_heap;
        for (i, vec_data) in self.buffer_chaos_vectors.chunks(128).enumerate() {
             let mut dot = 0.0;
             let mut norm_sq = 0.0;
             for (j, &val) in vec_data.iter().enumerate() {
                 let v = val.to_f32();
                 dot += v * query_f32[j];
                 norm_sq += v * v;
             }
             let score = if norm_sq > 0.0 {
                  dot / (norm_sq.sqrt() * query_norm)
             } else { 0.0 };
             
             final_heap.push(ScoredNode(disk_count + i, score));
             if final_heap.len() > k {
                 final_heap.pop();
             }
        }
        
        let mut results: Vec<(usize, f32)> = final_heap.into_iter().map(|n| (n.0, n.1)).collect();
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        results
    }

    /// 执行 Chaos Fingerprint (u128) 并行扫描 (Coarse L1)
    /// 返回 Top-N 候选 (index, distance)
    pub fn scan_chaos_parallel(&self, query_fp: u128, n: usize) -> Vec<(usize, u32)> {
        use rayon::prelude::*;
        use std::collections::BinaryHeap;

        #[derive(Copy, Clone, Eq, PartialEq)]
        struct Candidate(usize, u32);
        
        // Max-heap to keep smallest N distances (pop the largest distance)
        impl Ord for Candidate {
            fn cmp(&self, other: &Self) -> std::cmp::Ordering {
                self.1.cmp(&other.1) // Max distance at top
            }
        }
        impl PartialOrd for Candidate {
            fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        let disk_count = self.header.node_count as usize;
        
        // Scan Disk (Parallel)
        let candidates_heap = self.chaos_fingerprints
            .par_iter()
            .enumerate()
            .fold(
                || BinaryHeap::with_capacity(n + 1),
                |mut heap: BinaryHeap<Candidate>, (i, &fp)| {
                    let dist = (fp ^ query_fp).count_ones();
                    heap.push(Candidate(i, dist));
                    if heap.len() > n {
                        heap.pop();
                    }
                    heap
                }
            )
            .reduce(
                || BinaryHeap::with_capacity(n + 1),
                |mut heap1, heap2| {
                    for item in heap2 {
                        heap1.push(item);
                        if heap1.len() > n {
                            heap1.pop();
                        }
                    }
                    heap1
                }
            );

        // Scan Buffer (Linear)
        let mut final_heap = candidates_heap;
        for (i, &fp) in self.buffer_chaos_fingerprints.iter().enumerate() {
            let dist = (fp ^ query_fp).count_ones();
            final_heap.push(Candidate(disk_count + i, dist));
            if final_heap.len() > n {
                final_heap.pop();
            }
        }
        
        let mut results: Vec<(usize, u32)> = final_heap.into_iter().map(|c| (c.0, c.1)).collect();
        results.sort_by_key(|k| k.1); // Sort by distance ascending
        results
    }

    /// 执行混合检索 (Hybrid Scan): L1 Chaos Fingerprint (u128) -> L2 Chaos Vector (f16)
    pub fn search_hybrid(&self, query_fp: u128, query_vec: &[f16], top_k: usize, l1_candidates: usize) -> Vec<(usize, f32)> {
        // Step 1: L1 Coarse Filter (u128 Hamming Distance)
        let candidates = self.scan_chaos_parallel(query_fp, l1_candidates);
        
        // Step 2: L2 Fine Rank (Cosine Similarity on Candidates)
        let query_f32: Vec<f32> = query_vec.iter().map(|&x| x.to_f32()).collect();
        let query_norm = query_f32.iter().map(|x| x * x).sum::<f32>().sqrt();
        
        if query_norm == 0.0 { return vec![]; }

        let mut results = Vec::with_capacity(candidates.len());
        
        for (idx, _) in candidates {
            let vec_data = self.get_chaos_vector_by_idx(idx);
            
            let mut dot = 0.0;
            let mut norm_sq = 0.0;
            for (j, &val) in vec_data.iter().enumerate() {
                let v = val.to_f32();
                dot += v * query_f32[j];
                norm_sq += v * v;
            }
            
            let score = if norm_sq > 0.0 {
                 dot / (norm_sq.sqrt() * query_norm)
            } else { 0.0 };
            
            results.push((idx, score));
        }
        
        // Sort by score descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(top_k);
        results
    }

    /// 执行 SIMD 加速的混合扫描（磁盘 + 缓冲区）
    #[allow(dead_code)]
    pub fn scan_simd(&self, query_fp: u64) -> (usize, f32) {
        // 默认扫描所有节点 (node_type filter = None)
        self.scan_simd_filtered(query_fp, None)
    }

    /// 执行 SIMD 加速的混合扫描，支持按 node_type 过滤
    /// target_type: Some(0) = Ontology, Some(1) = Event, None = All
    pub fn scan_simd_filtered(&self, query_fp: u64, target_type: Option<u8>) -> (usize, f32) {
        let (mut max_idx, mut max_score) = self.scan_disk_part_filtered(query_fp, target_type);

        let disk_count = self.header.node_count as usize;
        
        // 扫描内存缓冲区
        for (i, &sh) in self.buffer_simhashes.iter().enumerate() {
            // 如果指定了类型且类型不匹配，跳过
            if let Some(tt) = target_type {
                if self.buffer_node_types[i] != tt {
                    continue;
                }
            }

            let dist = (sh ^ query_fp).count_ones();
            let score = 1.0 - (dist as f32 / 64.0);
            if score > max_score {
                max_score = score;
                max_idx = disk_count + i;
            }
        }

        (max_idx, max_score)
    }

    /// 磁盘部分扫描 (SIMD + Filter) - 占位函数
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    #[target_feature(enable = "avx2")]
    #[allow(unused_variables, dead_code)]
    unsafe fn scan_avx2_filtered(&self, query_fp: u64, target_type: Option<u8>) -> (usize, f32) {
        // 占位函数，目前统一由 scan_disk_part_filtered 处理
        // 如果需要极限性能，可以在这里实现带 mask 的 SIMD 扫描
        (0, 0.0)
    }

    fn scan_disk_part_filtered(&self, query_fp: u64, target_type: Option<u8>) -> (usize, f32) {
        if target_type.is_none() {
            return self.scan_disk_part(query_fp);
        }

        // 有过滤条件的标量扫描 (利用 CPU 分支预测和缓存预取)
        let mut max_score = -1.0;
        let mut max_idx = 0;
        let node_count = self.header.node_count as usize;
        let tt = target_type.unwrap();

        for i in 0..node_count {
            // 先检查类型 (轻量级比较)
            if self.metadata[i].node_type != tt {
                continue;
            }

            let dist = (self.simhashes[i] ^ query_fp).count_ones();
            let score = 1.0 - (dist as f32 / 64.0);
            if score > max_score {
                max_score = score;
                max_idx = i;
            }
        }
        
        (max_idx, max_score)
    }

    fn scan_disk_part(&self, query_fp: u64) -> (usize, f32) {
        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") {
                return unsafe { self.scan_avx2(query_fp) };
            }
        }
        self.scan_parallel(query_fp)
    }

    fn scan_parallel(&self, query_fp: u64) -> (usize, f32) {
        use rayon::prelude::*;
        self.simhashes
            .par_iter()
            .enumerate()
            .map(|(i, &sh)| {
                let dist = (sh ^ query_fp).count_ones();
                let score = 1.0 - (dist as f32 / 64.0);
                (i, score)
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .unwrap_or((0, 0.0))
    }

    #[cfg(target_arch = "x86_64")]
    #[target_feature(enable = "avx2")]
    unsafe fn scan_avx2(&self, query_fp: u64) -> (usize, f32) {
        use std::arch::x86_64::*;
        use rayon::prelude::*;

        let query_vec = _mm256_set1_epi64x(query_fp as i64);

        let chunk_size = 1024 * 64; 
        self.simhashes
            .par_chunks(chunk_size)
            .enumerate()
            .map(|(chunk_idx, chunk)| {
                let mut max_score = -1.0;
                let mut max_idx = 0;

                let mut i = 0;
                let ptr = chunk.as_ptr();
                let len = chunk.len();

                // 检查对齐情况 (Debug 模式)
                debug_assert!(ptr as usize % 32 == 0, "SIMD 指针未对齐 32 字节");

                // 每次处理 4 个 u64 (256位)
                while i + 4 <= len {
                    let data_vec: __m256i;
                    let xor_res: __m256i;
                    unsafe {
                        // 使用对齐加载 (已在生成时对齐到 32 字节)
                        data_vec = _mm256_load_si256(ptr.add(i) as *const __m256i);
                        // XOR 计算距离
                        xor_res = _mm256_xor_si256(data_vec, query_vec);
                    }
                    
                    // 手动提取并计算 popcount
                    let val0 = _mm256_extract_epi64(xor_res, 0) as u64;
                    let val1 = _mm256_extract_epi64(xor_res, 1) as u64;
                    let val2 = _mm256_extract_epi64(xor_res, 2) as u64;
                    let val3 = _mm256_extract_epi64(xor_res, 3) as u64;

                    let d0 = val0.count_ones();
                    let d1 = val1.count_ones();
                    let d2 = val2.count_ones();
                    let d3 = val3.count_ones();

                    // 批量计算 score 并更新 max
                    let s0 = 1.0 - (d0 as f32 / 64.0);
                    let s1 = 1.0 - (d1 as f32 / 64.0);
                    let s2 = 1.0 - (d2 as f32 / 64.0);
                    let s3 = 1.0 - (d3 as f32 / 64.0);

                    if s0 > max_score { max_score = s0; max_idx = i; }
                    if s1 > max_score { max_score = s1; max_idx = i + 1; }
                    if s2 > max_score { max_score = s2; max_idx = i + 2; }
                    if s3 > max_score { max_score = s3; max_idx = i + 3; }

                    i += 4;
                }

                // 处理剩余不足 4 个的部分
                for j in i..len {
                    let val = unsafe { *ptr.add(j) };
                    let dist = (val ^ query_fp).count_ones();
                    let score = 1.0 - (dist as f32 / 64.0);
                    if score > max_score {
                        max_score = score;
                        max_idx = j;
                    }
                }

                (chunk_idx * chunk_size + max_idx, max_score)
            })
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .unwrap_or((0, 0.0))
    }

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
}

/// 辅助函数：计算对齐后的偏移量
fn align_to(offset: u64, alignment: u64) -> u64 {
    (offset + alignment - 1) & !(alignment - 1)
}

/// 生成测试数据并写入磁盘 (SoA 布局)
pub fn generate_binary_dataset<F>(node_count: usize, index_path: &str, data_path: &str, vectorizer: F) -> io::Result<()> 
where F: Fn(&str) -> Vec<f16>
{
    println!("🏗️ 开始生成 V3 SoA 二进制数据集 ({} 节点)...", node_count);
    
    let f_index = File::create(index_path)?;
    let mut w_index = BufWriter::new(f_index);
    
    let f_data = File::create(data_path)?;
    let mut w_data = BufWriter::new(f_data);

    // 1. 计算对齐偏移量 (为了 SIMD 性能，使用 32 字节对齐)
    let header_size = std::mem::size_of::<IndexHeader>() as u64;
    let simhash_offset = align_to(header_size, 32);
    
    let simhash_size = (node_count * 8) as u64;
    let id_offset = align_to(simhash_offset + simhash_size, 32);
    
    let id_size = (node_count * 8) as u64;
    let metadata_offset = align_to(id_offset + id_size, 32);
    
    let metadata_size = (node_count * std::mem::size_of::<NodeMetadata>()) as u64;
    let chaos_fingerprint_offset = align_to(metadata_offset + metadata_size, 32);
    let chaos_fingerprint_size = (node_count * 16) as u64;
    
    let chaos_vector_offset = align_to(chaos_fingerprint_offset + chaos_fingerprint_size, 32);
    
    let header = IndexHeader {
        magic: 0x50454453415F5633,
        version: 2,
        node_count: node_count as u32,
        simhash_offset,
        id_offset,
        metadata_offset,
        chaos_fingerprint_offset,
        chaos_vector_offset,
    };

    // 写入 Header
    w_index.write_all(bytemuck::bytes_of(&header))?;

    // 2. 填充到 simhash_offset
    let current_pos = header_size;
    if simhash_offset > current_pos {
        let padding = vec![0u8; (simhash_offset - current_pos) as usize];
        w_index.write_all(&padding)?;
    }

    // 3. 写入 SimHashes
    for i in 0..node_count {
        let sh = (i as u64).wrapping_mul(0x9E3779B97F4A7C15);
        w_index.write_all(&sh.to_ne_bytes())?;
    }

    // 4. 填充到 id_offset
    let current_pos = simhash_offset + simhash_size;
    if id_offset > current_pos {
        let padding = vec![0u8; (id_offset - current_pos) as usize];
        w_index.write_all(&padding)?;
    }

    // 5. 写入 IDs
    for i in 0..node_count {
        let id = 2000000000 + i as i64;
        w_index.write_all(&id.to_ne_bytes())?;
    }

    // 6. 填充到 metadata_offset
    let current_pos = id_offset + id_size;
    if metadata_offset > current_pos {
        let padding = vec![0u8; (metadata_offset - current_pos) as usize];
        w_index.write_all(&padding)?;
    }

    // 7. 写入 Metadata 和 Data
    let mut current_data_offset = 0u64;
    for i in 0..node_count {
        let text = format!("这是一个模拟的事件总结节点，编号为 {}，用于 V3 SoA 架构测试。", i);
        let bytes = text.as_bytes();
        let meta = NodeMetadata {
            data_offset: current_data_offset,
            data_len: bytes.len() as u32,
            node_type: if i < 1000 { 0 } else { 1 }, // 模拟前 1000 个为本体节点
            _padding: [0; 3],
        };
        w_index.write_all(bytemuck::bytes_of(&meta))?;
        
        w_data.write_all(bytes)?;
        current_data_offset += bytes.len() as u64;

        if i % 100_000 == 0 {
            print!("\r已处理: {}/{}", i, node_count);
            io::stdout().flush()?;
        }
    }
    
    // 8. 填充到 chaos_fingerprint_offset
    let current_pos = metadata_offset + metadata_size;
    if chaos_fingerprint_offset > current_pos {
         let padding = vec![0u8; (chaos_fingerprint_offset - current_pos) as usize];
         w_index.write_all(&padding)?;
    }
    
    // 9. 写入 Chaos Fingerprints
    for i in 0..node_count {
         let cfp = (i as u128).wrapping_mul(0x123456789ABCDEF0123456789ABCDEF0);
         w_index.write_all(&cfp.to_ne_bytes())?;
    }
    
    // 10. 填充到 chaos_vector_offset
    let current_pos = chaos_fingerprint_offset + chaos_fingerprint_size;
    if chaos_vector_offset > current_pos {
         let padding = vec![0u8; (chaos_vector_offset - current_pos) as usize];
         w_index.write_all(&padding)?;
    }
    
    // 11. 写入 Chaos Vectors (128 dims * f16)
    for i in 0..node_count {
         let text = format!("这是一个模拟的事件总结节点，编号为 {}，用于 V3 SoA 架构测试。", i);
         let vec = vectorizer(&text);
         
         let final_vec = if vec.len() == 128 {
             vec
         } else {
             let mut v = vec;
             v.resize(128, f16::from_f32(0.0));
             v
         };

         w_index.write_all(bytemuck::cast_slice(&final_vec))?;
         
         if i % 10_000 == 0 {
            print!("\r已处理向量: {}/{}", i, node_count);
            io::stdout().flush()?;
        }
    }

    w_index.flush()?;
    w_data.flush()?;

    w_index.flush()?;
    w_data.flush()?;
    println!("\n✅ SoA 数据生成完成 (已完成 32 字节内存对齐)！");
    Ok(())
}
