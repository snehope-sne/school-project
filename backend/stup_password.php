<?php
require_once 'db_connection.php';

$users = [
    ['account' => 'admin',       'password' => 'admin123'],
    ['account' => 'rentalagent', 'password' => 'agent123'],
    ['account' => 'agent2',      'password' => 'agent456'],
];

foreach ($users as $u) {
    $hash = password_hash($u['password'], PASSWORD_BCRYPT);
    $stmt = $conn->prepare("UPDATE RENT SET PASS_HASH = ? WHERE ACCOUNT = ?");
    $stmt->bind_param("ss", $hash, $u['account']);
    $stmt->execute();
    echo "✅ " . $u['account'] . " → password set to: <b>" . $u['password'] . "</b> | hash: " . $hash . "<br>";
}
echo "<br>Done! Delete this file now.";
?>