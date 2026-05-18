<?php
// ============================================================
//  DARKETZ Car Rental — Customer Profile Operations
//
//  GET  ?action=get          → load full profile by email
//  POST ?action=update       → update personal info
//  POST ?action=update_kin   → upsert next of kin
//  POST ?action=upload_photo → upload profile picture
//  POST ?action=upload_licence → upload licence front/back images
//  POST ?action=change_password → change password
//  GET  ?action=bookings     → customer booking history
//  POST ?action=delete       → permanently delete account
//
//  Schema (CAR_RENTAL_MANAGEMENT3):
//    customer    → PK: Cust_National_ID (VARCHAR)
//    next_of_kin → PK: Cust_National_ID + Phone
//    license     → PK: License_No
//    rental      → FK: CUST_ID → customer.Cust_National_ID
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

// ── File upload directory (relative to this script) ──────────
define('UPLOAD_DIR',       __DIR__ . '/uploads/profiles/');
define('UPLOAD_URL_BASE',  'uploads/profiles/');   // URL path returned to client
define('MAX_FILE_BYTES',   5 * 1024 * 1024);        // 5 MB
define('ALLOWED_MIME',     ['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Create upload directory if it doesn't exist
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}

// ── Input parsing ─────────────────────────────────────────────
$rawInput  = file_get_contents('php://input');
$jsonInput = json_decode($rawInput, true) ?? [];
$action    = strtolower(trim($_GET['action'] ?? $_POST['action'] ?? $jsonInput['action'] ?? ''));

// ── Helper: sanitise a string value ──────────────────────────
$get = fn($arr, $key) => trim($arr[$key] ?? '');

// ── Helper: save an uploaded file, return URL path or error ──
function saveUploadedFile(array $file, string $prefix): array {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'message' => 'File upload error code: ' . $file['error']];
    }
    if ($file['size'] > MAX_FILE_BYTES) {
        return ['ok' => false, 'message' => 'File exceeds 5 MB limit.'];
    }

    // Validate MIME by reading the actual bytes
    $finfo    = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);
    if (!in_array($mimeType, ALLOWED_MIME, true)) {
        return ['ok' => false, 'message' => 'Invalid file type. Only JPG, PNG, GIF, WEBP allowed.'];
    }

    $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = $prefix . '_' . time() . '_' . bin2hex(random_bytes(6)) . '.' . strtolower($ext);
    $destPath = UPLOAD_DIR . $filename;

    if (!move_uploaded_file($file['tmp_name'], $destPath)) {
        return ['ok' => false, 'message' => 'Could not save file to disk.'];
    }

    return ['ok' => true, 'url' => UPLOAD_URL_BASE . $filename];
}

// ── Helper: format a booking row for customer history ─────────
function formatCustomerBooking(array $r): array {
    return [
        'rental_id'    => (int)$r['RENTAL_ID'],
        'vin'          => $r['VIN'],
        'vehicle_name' => trim(($r['BRAND'] ?? '') . ' ' . ($r['MAKE'] ?? '')),
        'plate'        => $r['PLATE_NUMBER'] ?? null,
        'category'     => $r['CATEGORY']     ?? null,
        'image_url'    => $r['IMAGE_URL']    ?? null,
        'daily_rate'   => isset($r['DAILY_RATE']) ? (float)$r['DAILY_RATE'] : null,
        'start_date'   => $r['START_DATE'],
        'return_date'  => $r['RETURN_DATE'],
        'date_booked'  => $r['DATE_BOOKED'],
        'status'       => $r['STATUS'],
        'purpose'      => $r['PURPOSE'] ?? null,
    ];
}


// ════════════════════════════════════════════════════════════
//  GET  ?action=get  — Load full profile by email
//       ?email=customer@example.com
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'get') {

    $email = strtolower(trim($_GET['email'] ?? ''));

    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'A valid email is required.']);
        $conn->close(); exit();
    }

    // ── Customer row ──────────────────────────────────────────
    $stmt = $conn->prepare("
        SELECT Cust_National_ID, First_Name, Last_Name, Email,
               Phone, Work_Phone, Phys_Address, City, Country,
               License_No, Profile_Img_URL, Is_Verified, Created_At
        FROM   customer
        WHERE  Email = ?
        LIMIT  1
    ");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $cust = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$cust) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    $national_id = $cust['Cust_National_ID'];

    // ── Licence images ────────────────────────────────────────
    $licStmt = $conn->prepare("
        SELECT Front_Img_URL, Back_Img_URL
        FROM   license
        WHERE  Cust_National_ID = ?
        LIMIT  1
    ");
    $licStmt->bind_param("s", $national_id);
    $licStmt->execute();
    $lic = $licStmt->get_result()->fetch_assoc();
    $licStmt->close();

    // ── Next of kin ───────────────────────────────────────────
    $kinStmt = $conn->prepare("
        SELECT First_Name, Last_Name, Phone, Phys_Address
        FROM   next_of_kin
        WHERE  Cust_National_ID = ?
        LIMIT  1
    ");
    $kinStmt->bind_param("s", $national_id);
    $kinStmt->execute();
    $kin = $kinStmt->get_result()->fetch_assoc();
    $kinStmt->close();

    // ── Booking counts ────────────────────────────────────────
    $cntStmt = $conn->prepare("
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN STATUS = 'Active' THEN 1 ELSE 0 END) AS active
        FROM   rental
        WHERE  CUST_ID = ?
    ");
    $cntStmt->bind_param("s", $national_id);
    $cntStmt->execute();
    $counts = $cntStmt->get_result()->fetch_assoc();
    $cntStmt->close();

    echo json_encode([
        'status'   => 'success',
        'profile'  => [
            'nationalId'     => $cust['Cust_National_ID'],
            'firstName'      => $cust['First_Name'],
            'lastName'       => $cust['Last_Name'],
            'email'          => $cust['Email'],
            'phone'          => $cust['Phone'],
            'workPhone'      => $cust['Work_Phone'],
            'address'        => $cust['Phys_Address'],
            'city'           => $cust['City'],
            'country'        => $cust['Country'],
            'licenceNo'      => $cust['License_No'],
            'profileImgUrl'  => $cust['Profile_Img_URL'],
            'isVerified'     => (bool)$cust['Is_Verified'],
            'joinedDate'     => $cust['Created_At'],
            'licenceFront'   => $lic['Front_Img_URL']  ?? null,
            'licenceBack'    => $lic['Back_Img_URL']   ?? null,
            'kinFirstName'   => $kin['First_Name']     ?? null,
            'kinLastName'    => $kin['Last_Name']       ?? null,
            'kinPhone'       => $kin['Phone']           ?? null,
            'kinAddress'     => $kin['Phys_Address']    ?? null,
        ],
        'stats' => [
            'totalRentals'   => (int)($counts['total']  ?? 0),
            'activeBookings' => (int)($counts['active'] ?? 0),
        ],
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=update — Update personal info
//  Body (JSON):
//    { nationalId, firstName, lastName, phone, workPhone,
//      address, city, country, licenceNo }
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'update') {

    $data = $jsonInput;

    $national_id  = $get($data, 'nationalId');
    $fname        = $get($data, 'firstName');
    $lname        = $get($data, 'lastName');
    $phone        = $get($data, 'phone');
    $work_phone   = $get($data, 'workPhone');
    $phys_address = $get($data, 'address');
    $city         = $get($data, 'city');
    $country      = $get($data, 'country');
    $licence_no   = $get($data, 'licenceNo');

    // ── Validation ────────────────────────────────────────────
    $errors = [];
    if (empty($national_id)) $errors[] = 'National ID is required.';
    if (empty($fname))        $errors[] = 'First name is required.';
    if (empty($lname))        $errors[] = 'Last name is required.';
    if (empty($phone))        $errors[] = 'Phone number is required.';

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        $conn->close(); exit();
    }

    // ── Verify customer exists ────────────────────────────────
    $chkStmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ? LIMIT 1");
    $chkStmt->bind_param("s", $national_id);
    $chkStmt->execute();
    $exists = $chkStmt->get_result()->fetch_assoc();
    $chkStmt->close();

    if (!$exists) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    $now = date('Y-m-d H:i:s');

    $upd = $conn->prepare("
        UPDATE customer
        SET    First_Name   = ?,
               Last_Name    = ?,
               Phone        = ?,
               Work_Phone   = ?,
               Phys_Address = ?,
               City         = ?,
               Country      = ?,
               License_No   = ?,
               Updated_At   = ?
        WHERE  Cust_National_ID = ?
    ");
    $upd->bind_param("ssssssssss",
        $fname, $lname, $phone, $work_phone,
        $phys_address, $city, $country,
        $licence_no, $now, $national_id
    );

    if (!$upd->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to update profile: ' . $upd->error]);
        $conn->close(); exit();
    }
    $upd->close();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Profile updated successfully.',
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=update_kin — Upsert next of kin
//  Body (JSON):
//    { nationalId, kinFirstName, kinLastName, kinPhone, kinAddress }
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'update_kin') {

    $data = $jsonInput;

    $national_id = $get($data, 'nationalId');
    $kin_fname   = $get($data, 'kinFirstName');
    $kin_lname   = $get($data, 'kinLastName');
    $kin_phone   = $get($data, 'kinPhone');
    $kin_address = $get($data, 'kinAddress');

    // ── Validation ────────────────────────────────────────────
    $errors = [];
    if (empty($national_id)) $errors[] = 'National ID is required.';
    if (empty($kin_fname))   $errors[] = 'Next of kin first name is required.';
    if (empty($kin_lname))   $errors[] = 'Next of kin last name is required.';
    if (empty($kin_phone))   $errors[] = 'Next of kin phone is required.';

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        $conn->close(); exit();
    }

    // ── Delete old kin record(s) for this customer, then insert fresh ──
    // (Schema PK is Cust_National_ID + Phone, so we replace the old entry)
    $delStmt = $conn->prepare("DELETE FROM next_of_kin WHERE Cust_National_ID = ?");
    $delStmt->bind_param("s", $national_id);
    $delStmt->execute();
    $delStmt->close();

    $insStmt = $conn->prepare("
        INSERT INTO next_of_kin (First_Name, Last_Name, Phone, Phys_Address, Cust_National_ID)
        VALUES (?, ?, ?, ?, ?)
    ");
    $insStmt->bind_param("sssss", $kin_fname, $kin_lname, $kin_phone, $kin_address, $national_id);

    if (!$insStmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to save next of kin: ' . $insStmt->error]);
        $conn->close(); exit();
    }
    $insStmt->close();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Next of kin saved successfully.',
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=upload_photo — Upload profile picture
//  multipart/form-data:
//    nationalId  (text field)
//    photo       (file field)
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'upload_photo') {

    $national_id = trim($_POST['nationalId'] ?? '');

    if (empty($national_id)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'nationalId is required.']);
        $conn->close(); exit();
    }

    if (empty($_FILES['photo']) || $_FILES['photo']['error'] === UPLOAD_ERR_NO_FILE) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No photo file received.']);
        $conn->close(); exit();
    }

    $result = saveUploadedFile($_FILES['photo'], 'avatar_' . preg_replace('/\W/', '', $national_id));

    if (!$result['ok']) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => $result['message']]);
        $conn->close(); exit();
    }

    $photoUrl = $result['url'];
    $now      = date('Y-m-d H:i:s');

    $upd = $conn->prepare("
        UPDATE customer
        SET    Profile_Img_URL = ?,
               Updated_At      = ?
        WHERE  Cust_National_ID = ?
    ");
    $upd->bind_param("sss", $photoUrl, $now, $national_id);

    if (!$upd->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Photo saved to disk but DB update failed: ' . $upd->error]);
        $conn->close(); exit();
    }
    $upd->close();

    echo json_encode([
        'status'        => 'success',
        'message'       => 'Profile photo updated.',
        'profileImgUrl' => $photoUrl,
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=upload_licence — Upload licence front & back
//  multipart/form-data:
//    nationalId   (text field)
//    licenceNo    (text field)
//    front        (file field — optional)
//    back         (file field — optional)
//  At least one of front / back must be provided.
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'upload_licence') {

    $national_id = trim($_POST['nationalId'] ?? '');
    $licence_no  = trim($_POST['licenceNo']  ?? '');

    if (empty($national_id)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'nationalId is required.']);
        $conn->close(); exit();
    }
    if (empty($licence_no)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'licenceNo is required.']);
        $conn->close(); exit();
    }

    $frontUrl = null;
    $backUrl  = null;

    // ── Process front image ───────────────────────────────────
    if (!empty($_FILES['front']) && $_FILES['front']['error'] !== UPLOAD_ERR_NO_FILE) {
        $res = saveUploadedFile($_FILES['front'], 'lic_front_' . preg_replace('/\W/', '', $national_id));
        if (!$res['ok']) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Front image: ' . $res['message']]);
            $conn->close(); exit();
        }
        $frontUrl = $res['url'];
    }

    // ── Process back image ────────────────────────────────────
    if (!empty($_FILES['back']) && $_FILES['back']['error'] !== UPLOAD_ERR_NO_FILE) {
        $res = saveUploadedFile($_FILES['back'], 'lic_back_' . preg_replace('/\W/', '', $national_id));
        if (!$res['ok']) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Back image: ' . $res['message']]);
            $conn->close(); exit();
        }
        $backUrl = $res['url'];
    }

    if ($frontUrl === null && $backUrl === null) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'At least one licence image (front or back) is required.']);
        $conn->close(); exit();
    }

    // ── Update customer.License_No ────────────────────────────
    $now = date('Y-m-d H:i:s');
    $updCust = $conn->prepare("
        UPDATE customer SET License_No = ?, Updated_At = ? WHERE Cust_National_ID = ?
    ");
    $updCust->bind_param("sss", $licence_no, $now, $national_id);
    $updCust->execute();
    $updCust->close();

    // ── Upsert licence images ─────────────────────────────────
    // Check if a licence row already exists for this customer
    $chkLic = $conn->prepare("SELECT License_No FROM license WHERE Cust_National_ID = ? LIMIT 1");
    $chkLic->bind_param("s", $national_id);
    $chkLic->execute();
    $existingLic = $chkLic->get_result()->fetch_assoc();
    $chkLic->close();

    if ($existingLic) {
        // Build dynamic UPDATE only for the columns being changed
        $setParts = [];
        $types    = '';
        $params   = [];

        if ($frontUrl !== null) { $setParts[] = 'Front_Img_URL = ?'; $types .= 's'; $params[] = $frontUrl; }
        if ($backUrl  !== null) { $setParts[] = 'Back_Img_URL  = ?'; $types .= 's'; $params[] = $backUrl;  }
        // Always update the licence number in case it changed
        $setParts[] = 'License_No = ?';
        $types     .= 's';
        $params[]   = $licence_no;
        // WHERE clause param
        $types   .= 's';
        $params[] = $national_id;

        $sql     = "UPDATE license SET " . implode(', ', $setParts) . " WHERE Cust_National_ID = ?";
        $updLic  = $conn->prepare($sql);
        $updLic->bind_param($types, ...$params);
        $updLic->execute();
        $updLic->close();

    } else {
        // Insert new licence row
        $insLic = $conn->prepare("
            INSERT INTO license (License_No, Cust_National_ID, Front_Img_URL, Back_Img_URL)
            VALUES (?, ?, ?, ?)
        ");
        $insLic->bind_param("ssss", $licence_no, $national_id, $frontUrl, $backUrl);
        if (!$insLic->execute()) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Failed to save licence record: ' . $insLic->error]);
            $conn->close(); exit();
        }
        $insLic->close();
    }

    echo json_encode([
        'status'       => 'success',
        'message'      => 'Licence images saved successfully.',
        'licenceFront' => $frontUrl,
        'licenceBack'  => $backUrl,
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=change_password
//  Body (JSON):
//    { nationalId, currentPassword, newPassword }
//  NOTE: passwords are stored as bcrypt hashes (PASSWORD_BCRYPT)
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'change_password') {

    $data            = $jsonInput;
    $national_id     = $get($data, 'nationalId');
    $current_pwd     = $get($data, 'currentPassword');
    $new_pwd         = $get($data, 'newPassword');
    $confirm_pwd     = $get($data, 'confirmPassword');

    // ── Validation ────────────────────────────────────────────
    $errors = [];
    if (empty($national_id))  $errors[] = 'National ID is required.';
    if (empty($current_pwd))  $errors[] = 'Current password is required.';
    if (empty($new_pwd))      $errors[] = 'New password is required.';
    if (strlen($new_pwd) < 8) $errors[] = 'New password must be at least 8 characters.';
    if ($new_pwd !== $confirm_pwd) $errors[] = 'New passwords do not match.';

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        $conn->close(); exit();
    }

    // ── Fetch current hash ────────────────────────────────────
    $fetchStmt = $conn->prepare("
        SELECT Password_Hash FROM customer WHERE Cust_National_ID = ? LIMIT 1
    ");
    $fetchStmt->bind_param("s", $national_id);
    $fetchStmt->execute();
    $row = $fetchStmt->get_result()->fetch_assoc();
    $fetchStmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    // ── Verify current password ───────────────────────────────
    if (!password_verify($current_pwd, $row['Password_Hash'])) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Current password is incorrect.']);
        $conn->close(); exit();
    }

    // ── Hash and save new password ────────────────────────────
    $newHash = password_hash($new_pwd, PASSWORD_BCRYPT);
    $now     = date('Y-m-d H:i:s');

    $updStmt = $conn->prepare("
        UPDATE customer SET Password_Hash = ?, Updated_At = ? WHERE Cust_National_ID = ?
    ");
    $updStmt->bind_param("sss", $newHash, $now, $national_id);

    if (!$updStmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to update password: ' . $updStmt->error]);
        $conn->close(); exit();
    }
    $updStmt->close();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Password changed successfully.',
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  GET ?action=bookings — Customer booking history
//       ?national_id=...
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'bookings') {

    $national_id = trim($_GET['national_id'] ?? '');

    if (empty($national_id)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'national_id is required.']);
        $conn->close(); exit();
    }

    $stmt = $conn->prepare("
        SELECT r.RENTAL_ID, r.VIN, r.START_DATE, r.RETURN_DATE,
               r.DATE_BOOKED, r.STATUS, r.PURPOSE,
               v.BRAND, v.MAKE, v.PLATE_NUMBER, v.CATEGORY,
               v.DAILY_RATE, v.IMAGE_URL
        FROM   rental  r
        JOIN   vehicle v ON v.VIN = r.VIN
        WHERE  r.CUST_ID = ?
        ORDER  BY r.DATE_BOOKED DESC
    ");
    $stmt->bind_param("s", $national_id);
    $stmt->execute();
    $result   = $stmt->get_result();
    $bookings = [];
    while ($row = $result->fetch_assoc()) {
        $bookings[] = formatCustomerBooking($row);
    }
    $stmt->close();

    echo json_encode([
        'status'   => 'success',
        'bookings' => $bookings,
        'total'    => count($bookings),
    ]);
    $conn->close(); exit();
}


// ════════════════════════════════════════════════════════════
//  POST ?action=delete — Permanently delete a customer account
//  Body (JSON):
//    { nationalId, password }   ← password required to confirm
// ════════════════════════════════════════════════════════════
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'delete') {

    $data        = $jsonInput;
    $national_id = $get($data, 'nationalId');
    $password    = $get($data, 'password');

    if (empty($national_id) || empty($password)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'nationalId and password are required.']);
        $conn->close(); exit();
    }

    // ── Fetch hash to verify identity ─────────────────────────
    $fetchStmt = $conn->prepare("
        SELECT Password_Hash FROM customer WHERE Cust_National_ID = ? LIMIT 1
    ");
    $fetchStmt->bind_param("s", $national_id);
    $fetchStmt->execute();
    $row = $fetchStmt->get_result()->fetch_assoc();
    $fetchStmt->close();

    if (!$row || !password_verify($password, $row['Password_Hash'])) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Incorrect password. Account not deleted.']);
        $conn->close(); exit();
    }

    // ── Delete in FK-safe order ───────────────────────────────
    // 1. re_turn rows linked to this customer's rentals
    $delReturn = $conn->prepare("
        DELETE rt FROM re_turn rt
        JOIN   rental r ON r.RENTAL_ID = rt.RENTAL_ID
        WHERE  r.CUST_ID = ?
    ");
    $delReturn->bind_param("s", $national_id);
    $delReturn->execute();
    $delReturn->close();

    // 2. rental rows
    $delRental = $conn->prepare("DELETE FROM rental WHERE CUST_ID = ?");
    $delRental->bind_param("s", $national_id);
    $delRental->execute();
    $delRental->close();

    // 3. licence
    $delLic = $conn->prepare("DELETE FROM license WHERE Cust_National_ID = ?");
    $delLic->bind_param("s", $national_id);
    $delLic->execute();
    $delLic->close();

    // 4. next of kin
    $delKin = $conn->prepare("DELETE FROM next_of_kin WHERE Cust_National_ID = ?");
    $delKin->bind_param("s", $national_id);
    $delKin->execute();
    $delKin->close();

    // 5. customer
    $delCust = $conn->prepare("DELETE FROM customer WHERE Cust_National_ID = ?");
    $delCust->bind_param("s", $national_id);
    if (!$delCust->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to delete account: ' . $delCust->error]);
        $conn->close(); exit();
    }
    $delCust->close();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Account permanently deleted.',
    ]);
    $conn->close(); exit();
}


// ── Fallback ─────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>