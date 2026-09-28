-- MySQL 8.0+: nullable server-managed Tencent PersonId, no existing user data rewritten.
-- PersonId must be unique, case-sensitive, and set ONLY after trusted cloud enrollment.
DROP PROCEDURE IF EXISTS migrate_tencent_face;
DELIMITER //
CREATE PROCEDURE migrate_tencent_face()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='tencent_person_id') THEN
    ALTER TABLE users ADD COLUMN tencent_person_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='users' AND index_name='uq_users_tencent_person') THEN
    ALTER TABLE users ADD UNIQUE KEY uq_users_tencent_person (tencent_person_id);
  END IF;
END//
DELIMITER ;
CALL migrate_tencent_face();
DROP PROCEDURE migrate_tencent_face;
