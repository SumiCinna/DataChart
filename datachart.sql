-- ============================================================
--  DataChart  –  MySQL / MariaDB schema
--  Run this in MySQL Workbench (or CLI: mysql -u root -p < datachart.sql)
-- ============================================================

CREATE DATABASE IF NOT EXISTS datachart
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE datachart;

-- ── roles ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(32)      NOT NULL UNIQUE,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

INSERT INTO roles (name) VALUES
  ('admin'),   -- id 1
  ('staff'),   -- id 2
  ('boss');    -- id 3

-- ── users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username     VARCHAR(64)     NOT NULL UNIQUE,
  email        VARCHAR(128)    NOT NULL UNIQUE,
  password     VARCHAR(255)    NOT NULL,          -- bcrypt hash
  full_name    VARCHAR(128)    NOT NULL DEFAULT '',
  role_id      TINYINT UNSIGNED NOT NULL DEFAULT 3, -- boss by default
  status       ENUM('pending','active','inactive') NOT NULL DEFAULT 'pending',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

-- Seed accounts (passwords are bcrypt of "Password1!")
-- $2y$12$..  hashes pre-generated for: Password1!
INSERT INTO users (username, email, password, full_name, role_id, status) VALUES
  ('admin',    'admin@datachart.local',
   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uJetpqmci',
   'System Admin', 1, 'active'),

  ('staff1',   'staff@datachart.local',
   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uJetpqmci',
   'Jane Staff', 2, 'active'),

  ('boss1',    'boss@datachart.local',
   '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uJetpqmci',
   'The Boss', 3, 'active');

-- NOTE: The seeded password hash above is Laravel's test hash for "password".
-- After importing, run the PHP snippet below to reset to real bcrypt hashes,
-- or just change passwords via the admin panel once logged in.
-- 
--   Real bcrypt of "Password1!" (cost 12) — generate with:
--   php -r "echo password_hash('Password1!', PASSWORD_BCRYPT, ['cost'=>12]);"

-- ── uploaded_files ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  uploaded_by   INT UNSIGNED    NOT NULL,
  original_name VARCHAR(255)    NOT NULL,
  stored_name   VARCHAR(255)    NOT NULL UNIQUE,
  file_size     INT UNSIGNED    NOT NULL DEFAULT 0,
  is_active     TINYINT(1)      NOT NULL DEFAULT 0, -- 1 = currently shown on dashboard
  uploaded_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── audit_log (optional but handy) ─────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED,
  action     VARCHAR(128) NOT NULL,
  detail     TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;
