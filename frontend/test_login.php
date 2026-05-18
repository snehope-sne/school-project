<?php
require_once 'db_connection.php';

$username = 'rentalagent';
$password = 'agent123';

// Step 1: Check if user exists
$stmt = $conn->prepare("SELECT EMP_ID, ACCOUNT, PASS_HASH FROM RENT WHERE ACCOUNT = ? LIMIT 1");
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo "❌ User NOT found in database";
    exit();
}

$emp = $result->fetch_assoc();
echo "✅ User found: " . $emp['ACCOUNT'] . "<br>";
echo "Hash in DB: [" . $emp['PASS_HASH'] . "]<br>";
echo "Hash length: " . strlen($emp['PASS_HASH']) . "<br>";

// Step 2: Test password_verify
if (password_verify($password, $emp['PASS_HASH'])) {
    echo "✅ Password MATCHES!";
} else {
    echo "❌ Password does NOT match<br>";
    
    // Step 3: Generate a correct hash so you can update manually
    echo "Correct hash for 'admin123': " . password_hash($password, PASSWORD_BCRYPT);
}
?>