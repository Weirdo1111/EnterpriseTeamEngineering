-- Restartable for manually applied or partially completed databases.
DROP PROCEDURE IF EXISTS migrate_knowledge_provenance;
DELIMITER //
CREATE PROCEDURE migrate_knowledge_provenance()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='source_url') THEN
    ALTER TABLE knowledge_documents ADD COLUMN source_url VARCHAR(1000) NULL AFTER source_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='publisher') THEN
    ALTER TABLE knowledge_documents ADD COLUMN publisher VARCHAR(255) NULL AFTER source_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='license_name') THEN
    ALTER TABLE knowledge_documents ADD COLUMN license_name VARCHAR(100) NULL AFTER publisher;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='license_url') THEN
    ALTER TABLE knowledge_documents ADD COLUMN license_url VARCHAR(1000) NULL AFTER license_name;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='dataset_category') THEN
    ALTER TABLE knowledge_documents ADD COLUMN dataset_category VARCHAR(100) NULL AFTER license_url;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='knowledge_documents' AND column_name='is_synthetic') THEN
    ALTER TABLE knowledge_documents ADD COLUMN is_synthetic TINYINT(1) NOT NULL DEFAULT 0 AFTER dataset_category;
  END IF;
END//
DELIMITER ;
CALL migrate_knowledge_provenance();
DROP PROCEDURE migrate_knowledge_provenance;
