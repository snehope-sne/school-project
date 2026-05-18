<?php
header("Access-Control-Allow-Origin: https://school-project-psaa.onrender.com");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ============================================================
//  DARKETZ Car Rental — Booking Operations
//
//  POST ?action=submitwithpayment → full booking + payment
//  GET  ?action=getaccount        → customer account lookup
//  GET  ?action=getprofile        → customer profile by email
//  GET  ?action=list              → all bookings (admin)
//  GET  ?action=get               → single booking
//  POST ?action=cancel            → cancel booking
//  POST ?action=return            → mark vehicle returned
//
//  New table: customer_account (see SQL below)
//  ──────────────────────────────────────────────
//  CREATE TABLE customer_account (
//      ACC_ID          INT AUTO_INCREMENT PRIMARY KEY,
//      CUST_ID         VARCHAR(20) NOT NULL,
//      ACC_NO          VARCHAR(50) NOT NULL UNIQUE,
//      ACC_HOLDER_NAME VARCHAR(100) NOT NULL,
//      BANK_NAME       VARCHAR(100),
//      PIN_HASH        VARCHAR(255) NOT NULL,
//      BALANCE         DECIMAL(10,2) DEFAULT 0.00,
//      CREATED_AT      DATETIME DEFAULT CURRENT_TIMESTAMP,
//      UPDATED_AT      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//      FOREIGN KEY (CUST_ID) REFERENCES customer(Cust_National_ID)
//  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
// ============================================================

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    exit(0);
}

error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once 'db_connection.php';

$rawInput  = file_get_contents('php://input');
$jsonInput = json_decode($rawInput, true) ?? [];
$action    = strtolower(trim($_GET['action'] ?? $_POST['action'] ?? $jsonInput['action'] ?? ''));

// ── Helper: format a booking row ─────────────────────────────
function formatBooking(array $r): array {
    return [
        'rental_id'    => (int)$r['RENTAL_ID'],
        'rsv_id'       => (int)$r['RENTAL_ID'],
        'cust_id'      => $r['Cust_National_ID'],
        'vin'          => $r['VIN'],
        'start_date'   => $r['START_DATE'],
        'pickup_date'  => $r['START_DATE'],
        'return_date'  => $r['RETURN_DATE'],
        'date_booked'  => $r['DATE_BOOKED'],
        'status'       => $r['STATUS'],
        'purpose'      => $r['PURPOSE'] ?? null,
        'cust_fname'   => $r['First_Name']   ?? null,
        'cust_lname'   => $r['Last_Name']    ?? null,
        'email'        => $r['Email']        ?? null,
        'phone'        => $r['Phone']        ?? null,
        'work_phone'   => $r['Work_Phone']   ?? null,
        'phys_address' => $r['Phys_Address'] ?? null,
        'city'         => $r['City']         ?? null,
        'country'      => $r['Country']      ?? null,
        'id_no'        => $r['Cust_National_ID'] ?? null,
        'vehicle_name' => trim(($r['BRAND'] ?? '') . ' ' . ($r['MAKE'] ?? '')),
        'plate'        => $r['PLATE_NUMBER'] ?? null,
        'daily_rate'   => isset($r['DAILY_RATE']) ? (float)$r['DAILY_RATE'] : null,
    ];
}

// ── Ensure customer_account table exists ─────────────────────
function ensureAccountTable($conn): void {
    $conn->query("
        CREATE TABLE IF NOT EXISTS customer_account (
            ACC_ID          INT AUTO_INCREMENT PRIMARY KEY,
            CUST_ID         VARCHAR(20) NOT NULL,
            ACC_NO          VARCHAR(50) NOT NULL UNIQUE,
            ACC_HOLDER_NAME VARCHAR(100) NOT NULL,
            BANK_NAME       VARCHAR(100),
            PIN_HASH        VARCHAR(255) NOT NULL,
            BALANCE         DECIMAL(10,2) DEFAULT 0.00,
            CREATED_AT      DATETIME DEFAULT CURRENT_TIMESTAMP,
            UPDATED_AT      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (CUST_ID) REFERENCES customer(Cust_National_ID)
                ON DELETE CASCADE ON UPDATE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// ── GET CUSTOMER ACCOUNT ──────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'getaccount') {
    $cust_id = trim($_GET['cust_id'] ?? '');

    if (!$cust_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'cust_id is required.']);
        $conn->close(); exit();
    }

    ensureAccountTable($conn);

    $stmt = $conn->prepare("
        SELECT ACC_ID, ACC_NO, ACC_HOLDER_NAME, BANK_NAME, BALANCE
        FROM   customer_account
        WHERE  CUST_ID = ?
        LIMIT  1
    ");
    $stmt->bind_param("s", $cust_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        echo json_encode(['status' => 'not_found', 'message' => 'No account linked to this customer.']);
        $conn->close(); exit();
    }

    echo json_encode([
        'status'  => 'success',
        'account' => [
            'acc_id'          => (int)$row['ACC_ID'],
            'acc_no'          => $row['ACC_NO'],
            'acc_holder_name' => $row['ACC_HOLDER_NAME'],
            'bank_name'       => $row['BANK_NAME'],
            'balance'         => (float)$row['BALANCE'],
        ]
    ]);
    $conn->close(); exit();
}

// ── GET CUSTOMER PROFILE BY EMAIL ────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'getprofile') {
    $email = strtolower(trim($_GET['email'] ?? ''));

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'A valid email is required.']);
        $conn->close(); exit();
    }

    $stmt = $conn->prepare("
        SELECT Cust_National_ID, First_Name, Last_Name, Email,
               Phone, Work_Phone, Phys_Address, City, Country
        FROM   customer
        WHERE  Email = ?
        LIMIT  1
    ");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    echo json_encode([
        'status'   => 'success',
        'customer' => [
            'cust_id'     => $row['Cust_National_ID'],
            'firstName'   => $row['First_Name'],
            'lastName'    => $row['Last_Name'],
            'email'       => $row['Email'],
            'phone'       => $row['Phone'],
            'workPhone'   => $row['Work_Phone'],
            'physAddress' => $row['Phys_Address'],
            'city'        => $row['City'],
            'country'     => $row['Country'],
            'idNumber'    => $row['Cust_National_ID'],
        ]
    ]);
    $conn->close(); exit();
}

// ── LIST ALL BOOKINGS ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {
    $sql = "
        SELECT r.*,
               c.First_Name, c.Last_Name, c.Email, c.Phone, c.Work_Phone,
               c.Phys_Address, c.City, c.Country, c.Cust_National_ID,
               v.BRAND, v.MAKE, v.PLATE_NUMBER, v.DAILY_RATE
        FROM   rental r
        JOIN   customer c ON c.Cust_National_ID = r.CUST_ID
        JOIN   vehicle  v ON v.VIN              = r.VIN
        ORDER  BY r.DATE_BOOKED DESC
    ";
    $result   = $conn->query($sql);
    $bookings = [];
    while ($row = $result->fetch_assoc()) $bookings[] = formatBooking($row);

    echo json_encode(['status' => 'success', 'bookings' => $bookings]);
    $conn->close(); exit();
}

// ── GET SINGLE BOOKING ───────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get') {
    $rental_id = (int)($_GET['rental_id'] ?? $_GET['rsv_id'] ?? 0);

    if (!$rental_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id is required.']);
        $conn->close(); exit();
    }

    $stmt = $conn->prepare("
        SELECT r.*,
               c.First_Name, c.Last_Name, c.Email, c.Phone, c.Work_Phone,
               c.Phys_Address, c.City, c.Country, c.Cust_National_ID,
               v.BRAND, v.MAKE, v.PLATE_NUMBER, v.DAILY_RATE
        FROM   rental r
        JOIN   customer c ON c.Cust_National_ID = r.CUST_ID
        JOIN   vehicle  v ON v.VIN              = r.VIN
        WHERE  r.RENTAL_ID = ?
        LIMIT  1
    ");
    $stmt->bind_param("i", $rental_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Booking not found.']);
        $conn->close(); exit();
    }

    echo json_encode(['status' => 'success', 'booking' => formatBooking($row)]);
    $conn->close(); exit();
}

// ─────────────────────────────────────────────────────────────
//  SUBMIT BOOKING WITH PAYMENT  (replaces old ?action=submit)
// ─────────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'submitwithpayment') {

    ensureAccountTable($conn);

    $data     = $jsonInput;
    $customer = $data['customer'] ?? [];
    $booking  = $data['booking']  ?? [];
    $payment  = $data['payment']  ?? [];

    $get = fn($arr, $key) => trim($arr[$key] ?? '');

    // Customer fields
    $national_id  = $get($customer, 'idNumber');
    $fname        = $get($customer, 'firstName');
    $lname        = $get($customer, 'lastName');
    $email        = strtolower($get($customer, 'email'));
    $phone        = $get($customer, 'phone');
    $work_phone   = $get($customer, 'workPhone');
    $phys_address = $get($customer, 'physicalAddress');
    $city         = $get($customer, 'city');
    $country      = $get($customer, 'country');

    // Booking fields
    $vin            = $get($booking, 'vehicleId');
    $pickup_date    = $get($booking, 'pickupDate');
    $return_date    = $get($booking, 'returnDate');
    $booking_fee    = (float)($booking['bookingFee']    ?? 0);
    $coll_window    = $get($booking, 'collectionWindow');
    $date_booked    = date('Y-m-d H:i:s');

    // Payment fields
    $pay_method     = $get($payment, 'method');   // 'card' | 'account' | 'account_new'

    // ── Validation ───────────────────────────────────────────
    $errors = [];
    if (empty($national_id))  $errors[] = 'National ID is required.';
    if (empty($fname))        $errors[] = 'First name is required.';
    if (empty($lname))        $errors[] = 'Last name is required.';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'A valid email is required.';
    if (empty($phone))        $errors[] = 'Phone is required.';
    if (empty($work_phone))   $errors[] = 'Work phone is required.';
    if (empty($phys_address)) $errors[] = 'Physical address is required.';
    if (empty($city))         $errors[] = 'City is required.';
    if (empty($country))      $errors[] = 'Country is required.';
    if (empty($vin))          $errors[] = 'A vehicle must be selected.';
    if (empty($pickup_date))  $errors[] = 'Pickup date is required.';
    if (empty($return_date))  $errors[] = 'Return date is required.';
    if ($booking_fee <= 0)    $errors[] = 'Invalid booking fee.';
    if (!in_array($pay_method, ['card', 'account', 'account_new'])) $errors[] = 'Invalid payment method.';

    $pickup_dt = '';
    $return_dt = '';
    if ($pickup_date && $return_date) {
        $pickup_dt = date('Y-m-d H:i:s', strtotime($pickup_date));
        $return_dt = date('Y-m-d H:i:s', strtotime($return_date));
        if ($pickup_dt >= $return_dt) $errors[] = 'Return date must be after pickup date.';

        // Enforce 72-hour pickup window
        $maxPickup = date('Y-m-d H:i:s', strtotime('+72 hours'));
        if ($pickup_dt > $maxPickup) $errors[] = 'Pickup date must be within 72 hours of booking.';
    }

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        $conn->close(); exit();
    }

    // ── Verify vehicle ────────────────────────────────────────
    $vStmt = $conn->prepare("SELECT VEHICLE_STATUS, BRAND, MAKE FROM vehicle WHERE VIN = ? LIMIT 1");
    $vStmt->bind_param("s", $vin);
    $vStmt->execute();
    $vehicleRow = $vStmt->get_result()->fetch_assoc();
    $vStmt->close();

    if (!$vehicleRow) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Selected vehicle not found.']);
        $conn->close(); exit();
    }
    if ($vehicleRow['VEHICLE_STATUS'] !== 'Available') {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'Sorry, this vehicle is no longer available.']);
        $conn->close(); exit();
    }

    // ── Upsert customer ───────────────────────────────────────
    $cStmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ? LIMIT 1");
    $cStmt->bind_param("s", $national_id);
    $cStmt->execute();
    $existingCust = $cStmt->get_result()->fetch_assoc();
    $cStmt->close();

    $now_dt = date('Y-m-d H:i:s');

    if ($existingCust) {
        $upd = $conn->prepare("
            UPDATE customer
            SET    First_Name=?, Last_Name=?, Email=?, Phone=?, Work_Phone=?,
                   Phys_Address=?, City=?, Country=?, Updated_At=?
            WHERE  Cust_National_ID=?
        ");
        $upd->bind_param("ssssssssss",
            $fname, $lname, $email, $phone, $work_phone,
            $phys_address, $city, $country, $now_dt, $national_id
        );
        $upd->execute();
        $upd->close();
    } else {
        $ins = $conn->prepare("
            INSERT INTO customer
                (Cust_National_ID, First_Name, Last_Name, Email, Phone, Work_Phone,
                 Phys_Address, City, Country, Is_Verified, Created_At, Updated_At)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ");
        $ins->bind_param("sssssssssss",
            $national_id, $fname, $lname, $email, $phone, $work_phone,
            $phys_address, $city, $country, $now_dt, $now_dt
        );
        if (!$ins->execute()) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Failed to save customer: ' . $ins->error]);
            $conn->close(); exit();
        }
        $ins->close();
    }

    // ─────────────────────────────────────────────────────────
    //  PAYMENT PROCESSING (simulated)
    // ─────────────────────────────────────────────────────────

    $pay_acc_no = null;  // will be set below for the PAYMENT table

    if ($pay_method === 'card') {
        // Simulated card: just record the last 4 digits as a reference
        $card_raw   = $get($payment, 'cardNumber');
        $pay_acc_no = 'CARD-xxxx-' . substr($card_raw, -4);

        // If customer opted to save card, store a new account record
        $saveCard = !empty($payment['saveCard']);
        if ($saveCard) {
            // Check if they already have an account
            $chkAcc = $conn->prepare("SELECT ACC_ID FROM customer_account WHERE CUST_ID = ? LIMIT 1");
            $chkAcc->bind_param("s", $national_id);
            $chkAcc->execute();
            $existAcc = $chkAcc->get_result()->fetch_assoc();
            $chkAcc->close();

            if (!$existAcc) {
                // Generate a simulated account number from card
                $sim_acc_no    = 'SIM-' . strtoupper(substr(md5($card_raw . $national_id), 0, 10));
                $holder_name   = $get($payment, 'cardHolder') ?: "$fname $lname";
                $bank_name     = 'Card Account';
                $default_pin   = password_hash('0000', PASSWORD_DEFAULT); // default PIN — user should update
                $zero_balance  = 0.00;

                $insAcc = $conn->prepare("
                    INSERT INTO customer_account
                        (CUST_ID, ACC_NO, ACC_HOLDER_NAME, BANK_NAME, PIN_HASH, BALANCE)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                $insAcc->bind_param("sssssd",
                    $national_id, $sim_acc_no, $holder_name, $bank_name, $default_pin, $zero_balance
                );
                $insAcc->execute();
                $insAcc->close();
            }
        }

    } elseif ($pay_method === 'account') {
        // Existing account: verify PIN and deduct balance
        $acc_no_in  = $get($payment, 'accNo');
        $pin_in     = $get($payment, 'pin');

        $accStmt = $conn->prepare("
            SELECT ACC_ID, PIN_HASH, BALANCE
            FROM   customer_account
            WHERE  CUST_ID = ? AND ACC_NO = ?
            LIMIT  1
        ");
        $accStmt->bind_param("ss", $national_id, $acc_no_in);
        $accStmt->execute();
        $accRow = $accStmt->get_result()->fetch_assoc();
        $accStmt->close();

        if (!$accRow || !password_verify($pin_in, $accRow['PIN_HASH'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Incorrect PIN. Payment declined.']);
            $conn->close(); exit();
        }

        $current_balance = (float)$accRow['BALANCE'];
        if ($current_balance < $booking_fee) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Insufficient account balance.']);
            $conn->close(); exit();
        }

        // Deduct booking fee
        $new_balance = $current_balance - $booking_fee;
        $deductStmt  = $conn->prepare("UPDATE customer_account SET BALANCE = ? WHERE ACC_ID = ?");
        $deductStmt->bind_param("di", $new_balance, $accRow['ACC_ID']);
        $deductStmt->execute();
        $deductStmt->close();

        $pay_acc_no = $acc_no_in;

    } elseif ($pay_method === 'account_new') {
        // Register new account and pay
        $new_acc_no    = $get($payment, 'accNo');
        $bank_name     = $get($payment, 'bank');
        $holder_name   = $get($payment, 'accHolder') ?: "$fname $lname";
        $raw_pin       = $get($payment, 'pin');

        // Validate PIN
        if (!preg_match('/^\d{4}$/', $raw_pin)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'PIN must be exactly 4 digits.']);
            $conn->close(); exit();
        }

        // Check account number is not taken
        $dupCheck = $conn->prepare("SELECT ACC_ID FROM customer_account WHERE ACC_NO = ? LIMIT 1");
        $dupCheck->bind_param("s", $new_acc_no);
        $dupCheck->execute();
        $dupRow = $dupCheck->get_result()->fetch_assoc();
        $dupCheck->close();

        if ($dupRow) {
            http_response_code(409);
            echo json_encode(['status' => 'error', 'message' => 'That account number is already registered. Please use a different one.']);
            $conn->close(); exit();
        }

        $pin_hash     = password_hash($raw_pin, PASSWORD_DEFAULT);
        $zero_balance = 0.00;

        $insAcc = $conn->prepare("
            INSERT INTO customer_account
                (CUST_ID, ACC_NO, ACC_HOLDER_NAME, BANK_NAME, PIN_HASH, BALANCE)
            VALUES (?, ?, ?, ?, ?, ?)
        ");
        $insAcc->bind_param("sssssd",
            $national_id, $new_acc_no, $holder_name, $bank_name, $pin_hash, $zero_balance
        );
        if (!$insAcc->execute()) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Failed to create account: ' . $insAcc->error]);
            $conn->close(); exit();
        }
        $insAcc->close();

        $pay_acc_no = $new_acc_no;
    }

    // ── Insert rental record ─────────────────────────────────
    $bStmt = $conn->prepare("
        INSERT INTO rental
            (VIN, CUST_ID, START_DATE, RETURN_DATE, PURPOSE, STATUS, DATE_BOOKED)
        VALUES (?, ?, ?, ?, ?, 'Active', ?)
    ");
    $purpose_str = "Booking fee: E{$booking_fee} | Window: {$coll_window}";
    $bStmt->bind_param("ssssss", $vin, $national_id, $pickup_dt, $return_dt, $purpose_str, $date_booked);
    if (!$bStmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to create booking: ' . $bStmt->error]);
        $conn->close(); exit();
    }
    $rental_id = $conn->insert_id;
    $bStmt->close();

    // ── Record payment in PAYMENT table ─────────────────────
    // The PAYMENT table uses EMP_ID FK to RENT.EMP_ID (simulated — use 1 as system emp)
    // We'll store booking fee as the payment amount and acc_no as reference.
    // Get or create a system RENT entry with EMP_ID=1
    $rentCheck = $conn->prepare("SELECT EMP_ID FROM RENT WHERE EMP_ID = 1 LIMIT 1");
    $rentCheck->execute();
    $rentRow = $rentCheck->get_result()->fetch_assoc();
    $rentCheck->close();

    if (!$rentRow) {
        // Seed a system record in RENT so the FK doesn't fail
        $seedRent = $conn->prepare("INSERT INTO RENT (EMP_ID, ACCOUNT, EMP_NAME, LOCATION) VALUES (1, 'SYSTEM', 'Online Booking System', 'Online')");
        $seedRent->execute();
        $seedRent->close();
    }

    $pay_date  = date('Y-m-d H:i:s');
    $sys_emp   = 1;
    $payStmt = $conn->prepare("
        INSERT INTO PAYMENT (PAY_DATE, PAY_AMOUNT, ACC_NO, EMP_ID)
        VALUES (?, ?, ?, ?)
    ");
    $payStmt->bind_param("sdsi", $pay_date, $booking_fee, $pay_acc_no, $sys_emp);
    $payStmt->execute();
    $pay_id = $conn->insert_id;
    $payStmt->close();

    // ── Mark vehicle as Booked ───────────────────────────────
    $updV = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = 'Booked' WHERE VIN = ?");
    $updV->bind_param("s", $vin);
    $updV->execute();
    $updV->close();

    // ── Done ─────────────────────────────────────────────────
    http_response_code(201);
    echo json_encode([
        'status'      => 'success',
        'message'     => 'Booking confirmed and payment processed for ' . $vehicleRow['BRAND'] . ' ' . $vehicleRow['MAKE'] . '.',
        'rental_id'   => $rental_id,
        'rsv_id'      => $rental_id,
        'cust_id'     => $national_id,
        'pay_id'      => $pay_id,
        'vin'         => $vin,
        'start_date'  => $pickup_dt,
        'return_date' => $return_dt,
        'date_booked' => $date_booked,
        'booking_fee' => $booking_fee,
        'pay_method'  => $pay_method,
    ]);
    $conn->close(); exit();
}

// ── LEGACY ?action=submit (kept for backwards compat) ────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'submit') {
    // Redirect to submitwithpayment logic isn't practical here —
    // just return a helpful message so old calls don't silently fail.
    http_response_code(400);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Please use action=submitwithpayment. The booking flow now requires payment.'
    ]);
    $conn->close(); exit();
}

// ── RETURN VEHICLE ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'return') {
    $rental_id = (int)($jsonInput['rental_id'] ?? $jsonInput['rsv_id'] ?? $_POST['rental_id'] ?? 0);
    $comments  = trim($jsonInput['comments'] ?? $_POST['comments'] ?? '');

    if (!$rental_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id is required.']);
        $conn->close(); exit();
    }

    $fetchStmt = $conn->prepare("SELECT VIN, STATUS FROM rental WHERE RENTAL_ID = ? LIMIT 1");
    $fetchStmt->bind_param("i", $rental_id);
    $fetchStmt->execute();
    $bRow = $fetchStmt->get_result()->fetch_assoc();
    $fetchStmt->close();

    if (!$bRow) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Booking not found.']);
        $conn->close(); exit();
    }

    $retStmt = $conn->prepare("UPDATE rental SET STATUS = 'Returned' WHERE RENTAL_ID = ?");
    $retStmt->bind_param("i", $rental_id);
    $retStmt->execute();
    $retStmt->close();

    $actual_date = date('Y-m-d H:i:s');
    $is_late     = 0;
    $logStmt = $conn->prepare("INSERT INTO re_turn (RENTAL_ID, ACTUAL_DATE, IS_LATE, COMMENTS) VALUES (?, ?, ?, ?)");
    $logStmt->bind_param("isis", $rental_id, $actual_date, $is_late, $comments);
    $logStmt->execute();
    $logStmt->close();

    $vin = $bRow['VIN'];
    $restoreStmt = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = 'Available' WHERE VIN = ?");
    $restoreStmt->bind_param("s", $vin);
    $restoreStmt->execute();
    $restoreStmt->close();

    echo json_encode(['status' => 'success', 'message' => 'Vehicle returned. Booking #' . $rental_id . ' marked as Returned.']);
    $conn->close(); exit();
}

// ── CANCEL BOOKING ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'cancel') {
    $rental_id = (int)($jsonInput['rental_id'] ?? $jsonInput['rsv_id'] ?? $_POST['rental_id'] ?? 0);

    if (!$rental_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id is required.']);
        $conn->close(); exit();
    }

    $fetchStmt = $conn->prepare("SELECT VIN FROM rental WHERE RENTAL_ID = ? LIMIT 1");
    $fetchStmt->bind_param("i", $rental_id);
    $fetchStmt->execute();
    $bRow = $fetchStmt->get_result()->fetch_assoc();
    $fetchStmt->close();

    if (!$bRow) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Booking not found.']);
        $conn->close(); exit();
    }

    $cancelStmt = $conn->prepare("UPDATE rental SET STATUS = 'Cancelled' WHERE RENTAL_ID = ?");
    $cancelStmt->bind_param("i", $rental_id);
    $cancelStmt->execute();
    $cancelStmt->close();

    $vin = $bRow['VIN'];
    $restoreStmt = $conn->prepare("
        UPDATE vehicle SET VEHICLE_STATUS = 'Available'
        WHERE  VIN = ? AND VEHICLE_STATUS IN ('Booked', 'On Rental')
    ");
    $restoreStmt->bind_param("s", $vin);
    $restoreStmt->execute();
    $restoreStmt->close();

    echo json_encode(['status' => 'success', 'message' => 'Booking #' . $rental_id . ' cancelled and vehicle is now available.']);
    $conn->close(); exit();
}

// ── Fallback ──────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>