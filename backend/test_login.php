<?php
require_once 'db_connection.php';

$username = 'rentalagent';
$password = 'agent123';

$stmt = $conn->prepare(
    "SELECT EMP_ID, EMP_NAME, ACCOUNT, PASS_HASH, LOCATION, ROLE
     FROM RENT
     WHERE ACCOUNT = ?
     LIMIT 1"
);
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo "❌ User not found";
    exit();
}

$emp = $result->fetch_assoc();
echo "✅ Found user: " . $emp['ACCOUNT'] . "<br>";
echo "PASS_HASH: [" . $emp['PASS_HASH'] . "]<br>";
echo "Hash length: " . strlen($emp['PASS_HASH']) . "<br>";
echo "EMP_NAME: " . $emp['EMP_NAME'] . "<br>";
echo "ROLE: " . $emp['ROLE'] . "<br><br>";

if (password_verify($password, $emp['PASS_HASH'])) {
    echo "✅ password_verify PASSED — login should work!";
} else {
    echo "❌ password_verify FAILED<br>";
    echo "Fresh hash of 'agent123': " . password_hash($password, PASSWORD_BCRYPT) . "<br>";
    
    // Check for invisible characters
    echo "<br>Hash bytes: ";
    for ($i = 0; $i < strlen($emp['PASS_HASH']); $i++) {
        echo ord($emp['PASS_HASH'][$i]) . " ";
    }
}
?>