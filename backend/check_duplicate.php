<?php
header("Access-Control-Allow-Origin: https://school-project-psaa.onrender.com");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
/**
 * check_duplicate.php
 * Called by registration.js to check if a National ID or email already exists
 * before the user submits the full form.
 *
 * POST params:
 *   checkType  - 'id' or 'email'
 *   value      - the value to check
 *
 * Response JSON:
 *   { "exists": true|false, "message": "..." }
 */

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: POST, OPTIONS");
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    }
    exit(0);
}

error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['exists' => false, 'message' => 'Method not allowed.']);
    exit();
}

require_once 'db_connection.php';

$checkType = trim($_POST['checkType'] ?? '');
$value     = trim($_POST['value']     ?? '');

if ($checkType === '' || $value === '') {
    echo json_encode(['exists' => false, 'message' => 'Missing parameters.']);
    exit();
}

try {
    if ($checkType === 'id') {
        // Table: customer   Column: Cust_National_ID  (matches register.php)
        $stmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ?");
        if ($stmt === false) throw new Exception('Prepare failed (id): ' . $conn->error);
        $stmt->bind_param("s", $value);
        $stmt->execute();
        $exists  = $stmt->get_result()->num_rows > 0;
        $message = $exists ? 'An account with this National ID already exists.' : '';

    } elseif ($checkType === 'email') {
        // Table: customer   Column: Email  (matches register.php)
        $stmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Email = ?");
        if ($stmt === false) throw new Exception('Prepare failed (email): ' . $conn->error);
        $stmt->bind_param("s", $value);
        $stmt->execute();
        $exists  = $stmt->get_result()->num_rows > 0;
        $message = $exists ? 'An account with this email address already exists.' : '';

    } else {
        echo json_encode(['exists' => false, 'message' => 'Unknown check type.']);
        exit();
    }

    $stmt->close();
    $conn->close();

    echo json_encode(['exists' => $exists, 'message' => $message]);

} catch (Throwable $e) {
    // Return exists=false so the form is not hard-blocked on a DB hiccup;
    // register.php performs the authoritative duplicate check on final submit.
    // The 'error' key is for server-side logging — never shown to the user.
    echo json_encode(['exists' => false, 'message' => '', 'error' => $e->getMessage()]);
}
?>