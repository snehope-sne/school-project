CREATE DATABASE CAR_RENTAL_MANAGEMENT3;
USE CAR_RENTAL_MANAGEMENT3; 
     
     -- 1. Vehicle Table (VIN as PK, includes all Specs from Admin Dashboard)
      CREATE TABLE vehicle (
          VIN VARCHAR(17) PRIMARY KEY,
          PLATE_NUMBER VARCHAR(50) NOT NULL,
          BRAND VARCHAR(100),
          MAKE VARCHAR(100),         -- Model Name
          MODEL_YEAR VARCHAR(10),    -- Model Year (e.g. 2024)
          YEAR_OF_MANU VARCHAR(10),  -- Manufacturing Year
          TYPE VARCHAR(50),          -- Sedan, SUV, etc.
         CATEGORY VARCHAR(50),      -- Economy, Luxury, SUV
         V_CONDITION VARCHAR(100),  -- Excellent, Good, Fair
         DAILY_RATE DECIMAL(10,2),
    
         -- Specifications (Added)
         SEATS INT(2),
         TRANSMISSION VARCHAR(20),  -- Automatic, Manual, CVT
         FUEL_TYPE VARCHAR(20),     -- Petrol, Diesel, Hybrid, Electric
         ENGINE_SIZE VARCHAR(20),   -- e.g. 2.0L
         MILEAGE_RANGE VARCHAR(50), -- e.g. 12km/L
         DRIVE_TYPE VARCHAR(20),    -- FWD, RWD, AWD, 4WD
         FEATURES TEXT,             -- Stores JSON string of checked features
    
         IMAGE_URL VARCHAR(255),
         VEHICLE_STATUS VARCHAR(50) DEFAULT 'Available'
     )ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    
     -- 2. Customer Table (Includes Profile Picture and Terms Agreement)
     CREATE TABLE customer (
         Cust_National_ID VARCHAR(20) PRIMARY KEY,
         Email VARCHAR(100) UNIQUE,
         Password_Hash VARCHAR(255),
         First_Name VARCHAR(50),
         Last_Name VARCHAR(50),
         Phys_Address VARCHAR(255),
         Phone VARCHAR(20),
         Work_Phone VARCHAR(20),
         City VARCHAR(100),
         Country VARCHAR(100),
         License_No VARCHAR(50),
         Profile_Img_URL VARCHAR(255), -- Added
         Terms_Accepted TINYINT(1) DEFAULT 0, -- Added (1 = Agreed)
         Is_Verified TINYINT(1) DEFAULT 0,
         Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
         Updated_At DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     );
    
     -- 3. License Table (No Expiry Date as requested)
     CREATE TABLE license (
         License_No VARCHAR(50) PRIMARY KEY,
         Cust_National_ID VARCHAR(20),
         Front_Img_URL VARCHAR(255),
         Back_Img_URL VARCHAR(255),
         FOREIGN KEY (Cust_National_ID) REFERENCES customer(Cust_National_ID)
     );
    
     -- 4. Next of Kin Table
     CREATE TABLE next_of_kin (
         First_Name VARCHAR(50),
         Last_Name VARCHAR(50),
         Phone VARCHAR(20),
         Phys_Address VARCHAR(255),
         Cust_National_ID VARCHAR(20),
         PRIMARY KEY (Cust_National_ID, Phone),
         FOREIGN KEY (Cust_National_ID) REFERENCES customer(Cust_National_ID)
     );
    
     -- 5. Employee Table
     CREATE TABLE employee (
         EMP_ID INT(11) AUTO_INCREMENT PRIMARY KEY,
         EMP_FNAME VARCHAR(50),
            EMP_LNAME VARCHAR(50),
         EMAIL VARCHAR(100) UNIQUE,
         PHONE VARCHAR(20),
         ROLE VARCHAR(50), -- Admin or Rental Agent
         pass_hash VARCHAR(255)
     );
    
     -- 6. Rental Table
     CREATE TABLE rental (
    RENTAL_ID INT(11) AUTO_INCREMENT PRIMARY KEY,
    VIN VARCHAR(17),
    CUST_ID VARCHAR(20),
    START_DATE DATETIME,
    RETURN_DATE DATETIME,
    PURPOSE VARCHAR(255),
    MILEAGE_ACCESSORY VARCHAR(255),
    EMP_ID INT(11),
    STATUS VARCHAR(50) DEFAULT 'Active',
    DATE_BOOKED DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (VIN)
        REFERENCES vehicle (VIN),
    FOREIGN KEY (CUST_ID)
        REFERENCES customer (Cust_National_ID),
    FOREIGN KEY (EMP_ID)
        REFERENCES employee (EMP_ID)
);
    
     -- 7. Return Table
     CREATE TABLE re_turn (
         RETURN_ID INT(11) AUTO_INCREMENT PRIMARY KEY,
        RENTAL_ID INT(11),
         ACTUAL_DATE DATETIME,
   IS_LATE TINYINT(1),
   COMMENTS TEXT,
   FOREIGN KEY (RENTAL_ID) REFERENCES rental(RENTAL_ID)
    )ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
;

CREATE TABLE RENT (
    EMP_ID INT PRIMARY KEY AUTO_INCREMENT,
    ACCOUNT VARCHAR(50),
    EMP_NAME VARCHAR(100),
    LOCATION VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

   
   
    CREATE TABLE PAYMENT (
    PAY_ID INT PRIMARY KEY AUTO_INCREMENT,
    PAY_DATE datetime,
    PAY_AMOUNT DECIMAL(10, 2),
    ACC_NO VARCHAR(50),
    EMP_ID INT NOT NULL,
    FOREIGN KEY (EMP_ID) REFERENCES RENT(EMP_ID)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- ── 1. Create the late charge rate lookup table ───────────────
CREATE TABLE IF NOT EXISTS late_charge_rate (
    HOURS_LATE    TINYINT        NOT NULL COMMENT 'Hours-late bracket: 1, 2, 3, or 4',
    RATE_BRACKET  DECIMAL(10,2)  NOT NULL COMMENT 'Daily rate bracket (E400, E450, E500, E550, E600, E700, E900)',
    CHARGE_AMOUNT DECIMAL(10,2)  NOT NULL DEFAULT 0.00 COMMENT 'Late fee in Emalangeni for this bracket',
    PRIMARY KEY (HOURS_LATE, RATE_BRACKET)
) ENGINE=InnoDB COMMENT='Late return fee lookup table — matches the printed charge card';

-- ── 2. Seed the charge table from the physical charge card ────
--   Brackets:  E400  E450  E500   E550   E600   E700   E900
INSERT INTO late_charge_rate (HOURS_LATE, RATE_BRACKET, CHARGE_AMOUNT) VALUES
-- 1 hr late
(1, 400.00,   80.00),
(1, 450.00,   90.00),
(1, 500.00, 1000.00),   -- as on card (E1,000 for E500 bracket, 1hr)
(1, 550.00,  120.00),
(1, 600.00,  200.00),
(1, 700.00,  250.00),
(1, 900.00,  300.00),
-- 2 hrs late
(2, 400.00,  170.00),
(2, 450.00,  180.00),
(2, 500.00,  200.00),
(2, 550.00,  200.00),
(2, 600.00,  300.00),
(2, 700.00,  350.00),
(2, 900.00,  450.00),
-- 3 hrs late
(3, 400.00,  290.00),
(3, 450.00,  300.00),
(3, 500.00,  380.00),
(3, 550.00,  350.00),
(3, 600.00,  450.00),
(3, 700.00,  500.00),
(3, 900.00,  650.00),
-- 4 hrs late (= same as daily — vehicle counts as another day)
(4, 400.00,  400.00),
(4, 450.00,  450.00),
(4, 500.00,  500.00),
(4, 550.00,  550.00),
(4, 600.00,  600.00),
(4, 700.00,  700.00),
(4, 900.00, 9000.00)    -- as on card (E9,000 — confirm this is not a typo)
ON DUPLICATE KEY UPDATE CHARGE_AMOUNT = VALUES(CHARGE_AMOUNT);

-- ── 3. Add HOURS_LATE and LATE_CHARGE columns to re_turn ──────
--   (Only adds if they don't already exist — MySQL 8+ supports IF NOT EXISTS
--    for ALTER TABLE ADD COLUMN. For older versions use the procedure below.)

-- MySQL 8.0+:
ALTER TABLE re_turn
    ADD COLUMN  HOURS_LATE  INT           NOT NULL DEFAULT 0     COMMENT 'Hours the vehicle was returned late (0 = on time)',
    ADD COLUMN  LATE_CHARGE DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT 'Late fee charged in Emalangeni';

-- ── 4. Verify ─────────────────────────────────────────────────
SELECT 'late_charge_rate rows:' AS info, COUNT(*) AS count FROM late_charge_rate;
DESCRIBE re_turn;


select * from employee;

select * from customer;

delete from vehicle where VIN = 'V324XY7HI8FVBNV56';



