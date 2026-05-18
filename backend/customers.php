<?php
// ============================================================
//  DARKETZ Car Rental — Customer Operations
//
//  GET  ?action=list            → all customers (table view)
//  GET  ?action=lookup&id_no=  → find by National ID (step 0 lookup)
//  GET  ?action=profile&cust_id= → full profile incl. license images + kin
//  POST ?action=verify          → mark customer as verified (Is_Verified = 1)
//       Body: cust_id
//  POST ?action=walkin          → register walk-in customer
//       Body: fname, lname, id_no, phone, email, address,
//             kin_fname, kin_lname, kin_phone
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

// ── Helper: build a minimal customer array ──────────────────
function formatCustomer(array $r): array {
    return [
        'cust_id'    => $r['Cust_National_ID'],
        'id_no'      => $r['Cust_National_ID'],
        'fname'      => $r['First_Name']   ?? '',
        'lname'      => $r['Last_Name']    ?? '',
        'email'      => $r['Email']        ?? '',
        'phone'      => $r['Phone']        ?? '',
        'work_phone' => $r['Work_Phone']   ?? '',
        'address'    => $r['Phys_Address'] ?? '',
        'city'       => $r['City']         ?? '',
        'country'    => $r['Country']      ?? '',
        'license_no' => $r['License_No']   ?? '',
        'is_verified'=> (int)($r['Is_Verified'] ?? 0),
        'created_at' => $r['Created_At']   ?? null,
    ];
}

// ── LIST ALL CUSTOMERS ──────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {

    $result = $conn->query("
        SELECT  c.Cust_National_ID, c.First_Name, c.Last_Name,
                c.Email, c.Phone, c.Work_Phone,
                c.Phys_Address, c.City, c.Country,
                c.Is_Verified, c.Created_At,
                l.License_No
        FROM    customer c
        LEFT JOIN license l ON l.Cust_National_ID = c.Cust_National_ID
        ORDER BY c.Created_At DESC
    ");

    $customers = [];
    while ($r = $result->fetch_assoc()) {
        $customers[] = formatCustomer($r);
    }

    echo json_encode(['status' => 'success', 'customers' => $customers]);
    $conn->close(); exit();
}

// ── LOOKUP BY NATIONAL ID ───────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'lookup') {

    $id_no = trim($_GET['id_no'] ?? '');
    if (!$id_no) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'id_no is required.']);
        $conn->close(); exit();
    }

    $stmt = $conn->prepare("
        SELECT  c.Cust_National_ID, c.First_Name, c.Last_Name,
                c.Email, c.Phone, c.Work_Phone,
                c.Phys_Address, c.City, c.Country,
                c.Is_Verified, c.Created_At,
                l.License_No,
                k.First_Name AS Kin_FName,
                k.Last_Name  AS Kin_LName,
                k.Phone      AS Kin_Phone
        FROM    customer c
        LEFT JOIN license      l ON l.Cust_National_ID = c.Cust_National_ID
        LEFT JOIN next_of_kin  k ON k.Cust_National_ID = c.Cust_National_ID
        WHERE  c.Cust_National_ID = ?
        LIMIT  1
    ");
    $stmt->bind_param("s", $id_no);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$r) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    $customer             = formatCustomer($r);
    $customer['kin_fname'] = $r['Kin_FName'] ?? '';
    $customer['kin_lname'] = $r['Kin_LName'] ?? '';
    $customer['kin_phone'] = $r['Kin_Phone'] ?? '';

    echo json_encode(['status' => 'success', 'customer' => $customer]);
    $conn->close(); exit();
}

// ── FULL PROFILE (with license images + kin) ───────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'profile') {

    $cust_id = trim($_GET['cust_id'] ?? '');
    if (!$cust_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'cust_id is required.']);
        $conn->close(); exit();
    }

    $stmt = $conn->prepare("
        SELECT  c.Cust_National_ID, c.First_Name, c.Last_Name,
                c.Email, c.Phone, c.Work_Phone,
                c.Phys_Address, c.City, c.Country,
                c.Profile_Img_URL,
                c.Is_Verified, c.Created_At,
                l.License_No,
                l.Front_Img_URL AS License_Front,
                l.Back_Img_URL  AS License_Back,
                k.First_Name    AS Kin_FName,
                k.Last_Name     AS Kin_LName,
                k.Phone         AS Kin_Phone,
                k.Phys_Address  AS Kin_Address
        FROM    customer c
        LEFT JOIN license      l ON l.Cust_National_ID = c.Cust_National_ID
        LEFT JOIN next_of_kin  k ON k.Cust_National_ID = c.Cust_National_ID
        WHERE   c.Cust_National_ID = ?
        LIMIT   1
    ");
    $stmt->bind_param("s", $cust_id);
    $stmt->execute();
    $r = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$r) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    $customer = formatCustomer($r);
    // Extra fields only in profile response
    $customer['profile_img']       = $r['Profile_Img_URL'] ?? '';
    $customer['license_front_url'] = $r['License_Front']   ?? '';
    $customer['license_back_url']  = $r['License_Back']    ?? '';
    $customer['kin_fname']         = $r['Kin_FName']       ?? '';
    $customer['kin_lname']         = $r['Kin_LName']       ?? '';
    $customer['kin_phone']         = $r['Kin_Phone']       ?? '';
    $customer['kin_address']       = $r['Kin_Address']     ?? '';

    echo json_encode(['status' => 'success', 'customer' => $customer]);
    $conn->close(); exit();
}

// ── VERIFY CUSTOMER ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'verify') {

    $cust_id = trim($jsonInput['cust_id'] ?? $_POST['cust_id'] ?? '');

    if (!$cust_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'cust_id is required.']);
        $conn->close(); exit();
    }

    // Check customer exists and isn't already verified
    $check = $conn->prepare("SELECT Is_Verified FROM customer WHERE Cust_National_ID = ? LIMIT 1");
    $check->bind_param("s", $cust_id);
    $check->execute();
    $row = $check->get_result()->fetch_assoc();
    $check->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Customer not found.']);
        $conn->close(); exit();
    }

    if ((int)$row['Is_Verified'] === 1) {
        echo json_encode(['status' => 'success', 'message' => 'Customer is already verified.']);
        $conn->close(); exit();
    }

    $upd = $conn->prepare("UPDATE customer SET Is_Verified = 1, Updated_At = NOW() WHERE Cust_National_ID = ?");
    $upd->bind_param("s", $cust_id);
    if (!$upd->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to verify customer: ' . $upd->error]);
        $conn->close(); exit();
    }
    $upd->close();

    echo json_encode([
        'status'  => 'success',
        'message' => 'Customer verified successfully.',
        'cust_id' => $cust_id,
    ]);
    $conn->close(); exit();
}

// ── WALK-IN REGISTRATION ────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'walkin') {

    $get = fn($k) => trim($jsonInput[$k] ?? $_POST[$k] ?? '');

    $id_no     = $get('id_no');
    $fname     = $get('fname');
    $lname     = $get('lname');
    $phone     = $get('phone');
    $email     = strtolower($get('email'));
    $address   = $get('address');
    $kin_fname = $get('kin_fname');
    $kin_lname = $get('kin_lname');
    $kin_phone = $get('kin_phone');
    $license   = $get('license_no');

    if (!$id_no || !$fname || !$lname) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'id_no, fname and lname are required.']);
        $conn->close(); exit();
    }

    // Check if already exists
    $check = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ? LIMIT 1");
    $check->bind_param("s", $id_no);
    $check->execute();
    $existing = $check->get_result()->fetch_assoc();
    $check->close();

    if ($existing) {
        // Return existing customer
        $stmt = $conn->prepare("
            SELECT c.*, l.License_No
            FROM customer c
            LEFT JOIN license l ON l.Cust_National_ID = c.Cust_National_ID
            WHERE c.Cust_National_ID = ?
            LIMIT 1
        ");
        $stmt->bind_param("s", $id_no);
        $stmt->execute();
        $r = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        echo json_encode(['status' => 'success', 'customer' => formatCustomer($r)]);
        $conn->close(); exit();
    }

    $now = date('Y-m-d H:i:s');

    $ins = $conn->prepare("
        INSERT INTO customer
            (Cust_National_ID, First_Name, Last_Name, Email, Phone,
             Phys_Address, Is_Verified, Terms_Accepted, Created_At, Updated_At)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ");
    $ins->bind_param("ssssssss", $id_no, $fname, $lname, $email, $phone, $address, $now, $now);
    if (!$ins->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Registration failed: ' . $ins->error]);
        $conn->close(); exit();
    }
    $ins->close();

    // Insert license if provided
    if ($license) {
        $lic = $conn->prepare("INSERT IGNORE INTO license (License_No, Cust_National_ID) VALUES (?, ?)");
        $lic->bind_param("ss", $license, $id_no);
        $lic->execute();
        $lic->close();
    }

    // Insert next of kin if provided
    if ($kin_fname && $kin_phone) {
        $kin = $conn->prepare("
            INSERT IGNORE INTO next_of_kin
                (First_Name, Last_Name, Phone, Cust_National_ID)
            VALUES (?, ?, ?, ?)
        ");
        $kin->bind_param("ssss", $kin_fname, $kin_lname, $kin_phone, $id_no);
        $kin->execute();
        $kin->close();
    }

    echo json_encode([
        'status'   => 'created',
        'message'  => 'Walk-in customer registered.',
        'customer' => [
            'cust_id'    => $id_no,
            'id_no'      => $id_no,
            'fname'      => $fname,
            'lname'      => $lname,
            'email'      => $email,
            'phone'      => $phone,
            'address'    => $address,
            'is_verified'=> 0,
            'kin_fname'  => $kin_fname,
            'kin_lname'  => $kin_lname,
            'kin_phone'  => $kin_phone,
        ]
    ]);
    $conn->close(); exit();
}

// ── Fallback ────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>