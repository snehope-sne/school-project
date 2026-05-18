<?php

define('DB_HOST', 'localhost'); // Or your database host (e.g., 'localhost')
define('DB_USER', 'root');      // Your database username
define('DB_PASS', 'Cnethy2004!');          // Your database password
define('DB_NAME', 'CAR_RENTAL_MANAGEMENT3'); // The database name from your .sql file

// --- Establish Connection ---
// Create a new mysqli object to connect to the database
$conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);

// --- Check Connection ---
// Check if there was an error during connection
if ($conn->connect_error) {
    // If there is a connection error, stop the script and display an error message.
    // This should be handled more gracefully in a production environment (e.g., logging).
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Database connection failed: ' . $conn->connect_error
    ]);
    exit(); // Stop script execution
}

// --- Set Character Set ---
// It's good practice to set the character set to utf8mb4 for full Unicode support.
if (!$conn->set_charset("utf8mb4")) {
    // Handle charset error if needed
    // For simplicity, we are not adding a public error for this.
    error_log("Error loading character set utf8mb4: " . $conn->error);
}

// The $conn object is now ready to be used by other scripts that include this file.
?>
