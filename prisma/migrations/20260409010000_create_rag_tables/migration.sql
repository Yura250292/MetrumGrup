-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Таблиця для векторів проектів
CREATE TABLE IF NOT EXISTS project_vectors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT, -- 'pdf', 'image', 'drawing'
  chunk_index INTEGER,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Індекс для векторного пошуку (HNSW найшвидший)
CREATE INDEX IF NOT EXISTS project_vectors_embedding_idx 
  ON project_vectors 
  USING hnsw (embedding vector_cosine_ops);

-- Індекс для фільтрації по проекту
CREATE INDEX IF NOT EXISTS project_vectors_project_id_idx 
  ON project_vectors(project_id);

-- Таблиця для збереження обробленого контенту проекту
CREATE TABLE IF NOT EXISTS project_parsed_content (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL UNIQUE,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  full_text TEXT,
  processing_status TEXT DEFAULT 'pending',
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Таблиця для кешування цін
CREATE TABLE IF NOT EXISTS price_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  material_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  average_price DECIMAL NOT NULL,
  sources JSONB DEFAULT '[]'::jsonb,
  confidence DECIMAL NOT NULL,
  embedding vector(1536),
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  UNIQUE(material_name, unit)
);

CREATE INDEX IF NOT EXISTS price_cache_embedding_idx 
  ON price_cache 
  USING hnsw (embedding vector_cosine_ops);
