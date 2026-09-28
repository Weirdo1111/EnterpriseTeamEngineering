CREATE TABLE IF NOT EXISTS knowledge_ingestion_jobs (
  id VARCHAR(64) NOT NULL,
  document_id VARCHAR(64) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  status ENUM('queued', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'queued',
  total_chunks INT UNSIGNED NOT NULL DEFAULT 0,
  completed_chunks INT UNSIGNED NOT NULL DEFAULT 0,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NULL,
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_ingestion_hash (content_hash),
  KEY idx_knowledge_ingestion_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_ingestion_job_chunks (
  job_id VARCHAR(64) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  location_label VARCHAR(100) NULL,
  heading VARCHAR(500) NULL,
  content TEXT NOT NULL,
  embedding LONGTEXT NOT NULL,
  embedding_model VARCHAR(100) NOT NULL,
  dimensions INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (job_id, chunk_index),
  CONSTRAINT fk_ingestion_chunk_job FOREIGN KEY (job_id) REFERENCES knowledge_ingestion_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO knowledge_ingestion_jobs
  (id, document_id, filename, source_type, content_hash, status, total_chunks, completed_chunks, attempts, started_at, completed_at)
SELECT CONCAT('KI-', SUBSTRING(content_hash, 1, 32)), id, filename, source_type, content_hash, 'ready', chunk_count, chunk_count, 1, created_at, updated_at
FROM knowledge_documents
WHERE status = 'ready';
