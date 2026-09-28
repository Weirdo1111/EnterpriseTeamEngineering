ALTER TABLE knowledge_documents
  ADD COLUMN source_url VARCHAR(1000) NULL AFTER source_type,
  ADD COLUMN publisher VARCHAR(255) NULL AFTER source_url,
  ADD COLUMN license_name VARCHAR(100) NULL AFTER publisher,
  ADD COLUMN license_url VARCHAR(1000) NULL AFTER license_name,
  ADD COLUMN dataset_category VARCHAR(100) NULL AFTER license_url,
  ADD COLUMN is_synthetic TINYINT(1) NOT NULL DEFAULT 0 AFTER dataset_category;
