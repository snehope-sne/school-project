<?php
// ── CORS Headers ─────────────────────────────────────────────
header("Access-Control-Allow-Origin: https://school-project-1-xdoe.onrender.com");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Credentials: true");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }
// ─────────────────────────────────────────────────────────────

require_once 'db_connection.php';

error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.']);
    exit();
}

// --- Input Validation ---
$errors   = [];
$fullName = trim($_POST['fullName'] ?? '');
$email    = trim($_POST['email']    ?? '');
$phone    = trim($_POST['phone']    ?? '');
$role     = trim($_POST['role']     ?? '');
$password = $_POST['password']      ?? '';

if (empty($fullName)) $errors[] = 'Full name is required.';
if (empty($email))    $errors[] = 'Email is required.';
elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email address.';
if (empty($phone))    $errors[] = 'Phone number is required.';
if (empty($role))     $errors[] = 'Role is required.';
elseif (!in_array($role, ['admin', 'rental_agent'])) $errors[] = 'Invalid role selected.';
if (empty($password)) $errors[] = 'Password is required.';
elseif (strlen($password) < 8) $errors[] = 'Password must be at least 8 characters.';

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => implode(' ', $errors)]);
    exit();
}

// Split full name into first and last
$nameParts = explode(' ', $fullName, 2);
$firstName = $nameParts[0];
$lastName  = $nameParts[1] ?? '';

try {
    // Check if email already exists
    $stmt = $conn->prepare("SELECT EMP_ID FROM employee WHERE EMAIL = ? LIMIT 1");
    if ($stmt === false) throw new Exception('Database error: ' . $conn->error);
    $stmt->bind_param("s", $email);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'An account with this email already exists.']);
        exit();
    }
    $stmt->close();

    // Hash password
    $passHash = password_hash($password, PASSWORD_DEFAULT);

    // Insert new employee
    $stmt = $conn->prepare("INSERT INTO employee (EMP_FNAME, EMP_LNAME, EMAIL, PHONE, ROLE, pass_hash) VALUES (?, ?, ?, ?, ?, ?)");
    if ($stmt === false) throw new Exception('Database error: ' . $conn->error);
    $stmt->bind_param("ssssss", $firstName, $lastName, $email, $phone, $role, $passHash);

    if (!$stmt->execute()) {
        throw new Exception('Failed to create employee account: ' . $stmt->error);
    }
    $stmt->close();

    http_response_code(201);
    echo json_encode([
        'status'  => 'success',
        'message' => 'Employee account created successfully!'
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
} finally {
    if (isset($conn) && $conn instanceof mysqli) $conn->close();
}
?>