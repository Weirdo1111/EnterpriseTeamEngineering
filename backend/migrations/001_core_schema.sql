CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NULL,
  role ENUM('doctor', 'seniorDoctor', 'admin') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS medical_records (
  id VARCHAR(64) NOT NULL,
  patient_id VARCHAR(64) NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  doctor_id BIGINT UNSIGNED NOT NULL,
  doctor_name VARCHAR(100) NOT NULL,
  chief_complaint VARCHAR(500) NOT NULL,
  present_illness TEXT NOT NULL,
  diagnosis VARCHAR(1000) NOT NULL,
  status ENUM('draft', 'pending', 'approved', 'returned', 'archived') NOT NULL DEFAULT 'draft',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ai_metadata JSON NULL,
  review_note TEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  submitted_at DATETIME(3) NULL,
  reviewed_at DATETIME(3) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_by_name VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_records_patient (patient_id, updated_at),
  KEY idx_records_status (status, updated_at),
  CONSTRAINT fk_records_doctor FOREIGN KEY (doctor_id) REFERENCES users (id),
  CONSTRAINT fk_records_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS medical_orders (
  id VARCHAR(64) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  order_type ENUM('Medication', 'Examination', 'Laboratory', 'Nursing') NOT NULL,
  content VARCHAR(2000) NOT NULL,
  status ENUM('active', 'stopped') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NOT NULL,
  created_by_name VARCHAR(100) NOT NULL,
  stopped_at DATETIME(3) NULL,
  stopped_by BIGINT UNSIGNED NULL,
  stopped_by_name VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_orders_record (record_id, created_at),
  CONSTRAINT fk_orders_record FOREIGN KEY (record_id) REFERENCES medical_records (id),
  CONSTRAINT fk_orders_creator FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_orders_stopper FOREIGN KEY (stopped_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS record_reviews (
  id VARCHAR(64) NOT NULL,
  record_id VARCHAR(64) NOT NULL,
  decision ENUM('approved', 'returned', 'archived') NOT NULL,
  reviewer_id BIGINT UNSIGNED NOT NULL,
  reviewer_name VARCHAR(100) NOT NULL,
  note TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reviews_record (record_id, created_at),
  CONSTRAINT fk_reviews_record FOREIGN KEY (record_id) REFERENCES medical_records (id),
  CONSTRAINT fk_reviews_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  user_name VARCHAR(100) NOT NULL,
  role VARCHAR(32) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  result ENUM('Success', 'Blocked', 'Pending Review') NOT NULL,
  ip_address VARCHAR(45) NULL,
  details JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_resource (resource_type, resource_id, created_at),
  KEY idx_audit_user (user_id, created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
