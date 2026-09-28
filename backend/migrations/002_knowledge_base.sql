CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  status ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_document_hash (content_hash),
  KEY idx_knowledge_document_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id VARCHAR(64) NOT NULL,
  chunk_index INT UNSIGNED NOT NULL,
  location_label VARCHAR(100) NULL,
  heading VARCHAR(500) NULL,
  content TEXT NOT NULL,
  embedding LONGTEXT NOT NULL,
  embedding_model VARCHAR(100) NOT NULL,
  dimensions INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_knowledge_chunk (document_id, chunk_index),
  KEY idx_knowledge_chunk_document (document_id),
  CONSTRAINT fk_knowledge_chunk_document FOREIGN KEY (document_id) REFERENCES knowledge_documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
