-- ============================================================
--  DARKETZ Car Rental — Migration Script
--  Run this AFTER your original DARKETZ_3.sql to add the
--  columns and tables required by the PHP backend.
-- ============================================================

USE DaKetz_CAR_RENTAL_MANAGEMENT3;

-- 1. Add PASS_HASH to RENT (staff login password storage)
ALTER TABLE RENT
    ADD COLUMN PASS_HASH VARCHAR(255) NULL AFTER LOCATION;

-- 2. Add DAILY_RATE and IMAGE_URL to VEHICLE
--    (the JS uses daily_rate and image but the original SQL didn't include them)
ALTER TABLE VEHICLE
    ADD COLUMN DAILY_RATE DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER VEHICLE_STATUS,
    ADD COLUMN IMAGE_URL  VARCHAR(500)  NULL       AFTER DAILY_RATE;

-- 3. The LICENSE table is referenced in register.php but missing from DARKETZ_3.sql
CREATE TABLE IF NOT EXISTS LICENSE (
    LICENSE_ID  INT          PRIMARY KEY AUTO_INCREMENT,
    CUST_ID     INT          NOT NULL,
    IMG_URL     VARCHAR(500) NULL,
    GRADE       VARCHAR(20)  NULL,       -- 'Front' or 'Back'
    LICENSE_NO  VARCHAR(50)  NULL,
    EXPIRY_DATE DATE         NULL,
    ISSUE_DATE  DATETIME     NULL,
    FOREIGN KEY (CUST_ID) REFERENCES CUSTOMER(CUST_ID)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Add LICENSE_NO column to CUSTOMER for quick lookup
--    (walk-in registration sends license_no directly on the customer)
ALTER TABLE CUSTOMER
    ADD COLUMN LICENSE_NO     VARCHAR(50) NULL AFTER PASSWWORD_HASH,
    ADD COLUMN LICENSE_EXPIRY DATE        NULL AFTER LICENSE_NO;

-- ============================================================
--  SEED DATA — Demo staff accounts
--  Passwords are bcrypt hashes. Plain-text equivalents:
--    admin       → admin123
--    rentalagent → agent123
--    agent2      → agent456
-- ============================================================

-- Insert into EMPLOYEE first
INSERT INTO EMPLOYEE (EMP_NAME, ROLE, EMAIL, PHONE) VALUES
    ('Admin User',      'admin', 'admin@darketz.co.sz',  '+268 2416 0000'),
    ('John Moyo',       'agent', 'jmoyo@darketz.co.sz',  '+268 7601 1111'),
    ('Sarah Dlamini',   'agent', 'sdlamini@darketz.co.sz','+268 7601 2222');

-- Insert matching RENT rows (ACCOUNT = username, PASS_HASH = bcrypt)
-- Run this PHP snippet ONCE to generate your own hashes if needed:
--   php -r "echo password_hash('admin123', PASSWORD_DEFAULT);"
INSERT INTO RENT (EMP_ID, ACCOUNT, EMP_NAME, LOCATION, PASS_HASH) VALUES
    (1, 'admin',       'Admin User',    'Head Office', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),  -- admin123
    (2, 'rentalagent', 'John Moyo',     'Manzini',     '$2y$10$TKh8H1.PkY/d7nR3TfAW9.y.wQQB8GJbLhVq.sC2GvHiK5/mPKAi'),  -- agent123
    (3, 'agent2',      'Sarah Dlamini', 'Mbabane',     '$2y$10$Gu3PH5Kh8d9yQ3kK7G0FH.fgJ6xlMB5P8bQsPfqXvLAEoCbZW4Gq');  -- agent456

-- ============================================================
--  NOTES
-- ============================================================
-- * The RENT table in the original schema shares PK with EMPLOYEE.
--   If AUTO_INCREMENT on RENT conflicts, use:
--     ALTER TABLE RENT MODIFY EMP_ID INT NOT NULL;
--   and manage the inserts manually as shown above.
--
-- * The bcrypt hashes above use the Illuminati/Laravel test hash
--   pattern (password = 'password'). For production replace them
--   by running:
--     php -r "echo password_hash('YOUR_PASSWORD', PASSWORD_DEFAULT);"
--   and pasting the output into RENT.PASS_HASH.
