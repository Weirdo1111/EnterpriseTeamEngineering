-- MySQL 8.0+. Inspected users.id: BIGINT (SIGNED), email: VARCHAR(100) NULL.
-- Run once in the selected application database. No user data is rewritten.
-- Guard the FK type before applying any DDL; fail safely on a different schema.
DROP PROCEDURE IF EXISTS migrate_login_codes;
DELIMITER //
CREATE PROCEDURE migrate_login_codes()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='id' AND column_type='bigint') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Expected users.id BIGINT SIGNED; inspect SHOW CREATE TABLE users before migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='email') THEN
    ALTER TABLE users ADD COLUMN email VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='phone') THEN
    ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL COMMENT 'Administrator preset E.164 number';
  END IF;
END//
DELIMITER ;
CALL migrate_login_codes();
DROP PROCEDURE migrate_login_codes;

CREATE TABLE IF NOT EXISTS auth_login_codes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id BIGINT NULL,
  channel ENUM('email','sms') NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  destination_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  delivery_status ENUM('queued','processing','pending','sent','failed','suppressed') NOT NULL DEFAULT 'queued',
  lease_expires_at DATETIME(3) NULL,
  INDEX code_queue (delivery_status, created_at),
  INDEX code_user_channel (user_id, channel, created_at),
  INDEX code_expiry (expires_at),
  CONSTRAINT code_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Small persistent limiter, shared by all backend processes. Contains only HMAC keys.
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  INDEX rate_expiry (expires_at)
) ENGINE=InnoDB;
