<?php

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
}

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    }
    exit(0);
}

error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');

require_once 'db_connection.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.']);
    exit();
}

// --- Input Validation ---
$errors   = [];
$email    = trim($_POST['email'] ?? '');
$password = $_POST['password'] ?? '';

if (empty($email)) {
    $errors[] = 'Email is required.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Invalid email address format.';
}

if (empty($password)) {
    $errors[] = 'Password is required.';
}

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
    exit();
}

// --- Database Operations ---
try {

    // -------------------------------------------------------
    // 1. Check EMPLOYEE table first (uses pass_hash column)
    // -------------------------------------------------------
    $empStmt = $conn->prepare("SELECT EMP_ID, EMP_FNAME, EMP_LNAME, ROLE, pass_hash FROM employee WHERE EMAIL = ? LIMIT 1");
    if ($empStmt === false) throw new Exception('Server error: Failed to prepare employee statement.');
    $empStmt->bind_param("s", $email);
    $empStmt->execute();
    $empResult = $empStmt->get_result();

    if ($empResult->num_rows === 1) {
        $emp = $empResult->fetch_assoc();
        $empStmt->close();

        if (password_verify($password, $emp['pass_hash'])) {
            $role = strtolower(trim($emp['ROLE']));

            // Admins are not permitted to log in through this endpoint
            if ($role === 'admin') {
                http_response_code(403);
                echo json_encode([
                    'status'   => 'error',
                    'message'  => 'Access denied. Admins must use the admin login portal.',
                    'redirect' => 'login.html'
                ]);
                exit();
            }

            $initials = strtoupper(substr($emp['EMP_FNAME'], 0, 1) . substr($emp['EMP_LNAME'], 0, 1));

            // Determine redirect based on role
            $redirect = match ($role) {
                'rental agent', 'rental_agent' => 'rental_dashboard.html',
                default                         => 'rental_dashboard.html'
            };

            http_response_code(200);
            echo json_encode([
                'status'   => 'success',
                'message'  => 'Login successful!',
                'redirect' => $redirect,
                'user'     => [
                    'id'       => $emp['EMP_ID'],
                    'name'     => $emp['EMP_FNAME'] . ' ' . $emp['EMP_LNAME'],
                    'email'    => $email,
                    'role'     => $role,
                    'initials' => $initials
                ]
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Invalid email or password.']);
        }
        exit();
    }
    $empStmt->close();

    // -------------------------------------------------------
    // 2. Not an employee — check CUSTOMER table (uses Password_Hash column)
    // -------------------------------------------------------
    $custStmt = $conn->prepare("SELECT Cust_National_ID, First_Name, Last_Name, Email, Password_Hash FROM customer WHERE Email = ? LIMIT 1");
    if ($custStmt === false) throw new Exception('Server error: Failed to prepare customer statement.');
    $custStmt->bind_param("s", $email);
    $custStmt->execute();
    $custResult = $custStmt->get_result();

    if ($custResult->num_rows === 1) {
        $user = $custResult->fetch_assoc();
        $custStmt->close();

        if (password_verify($password, $user['Password_Hash'])) {
            http_response_code(200);
            echo json_encode([
                'status'   => 'success',
                'message'  => 'Login successful!',
                'redirect' => 'index.html',
                'user'     => [
                    'id'        => $user['Cust_National_ID'],
                    'firstName' => $user['First_Name'],
                    'lastName'  => $user['Last_Name'],
                    'email'     => $user['Email'],
                    'role'      => 'customer'
                ]
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Invalid email or password.']);
        }
        exit();
    }
    $custStmt->close();

    // -------------------------------------------------------
    // 3. Email not found in either table
    // -------------------------------------------------------
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Invalid email or password.']);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => $e->getMessage()
    ]);
} finally {
    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }
}
?>