<?php

require_once 'db_connection.php';


error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once 'db_connection.php';

// Available vehicles
$r1        = $conn->query("SELECT COUNT(*) AS cnt FROM vehicle WHERE VEHICLE_STATUS = 'Available'");
$available = $r1->fetch_assoc()['cnt'] ?? 0;

// Vehicles currently on rental (physically out — started but not yet returned)
$r2       = $conn->query("SELECT COUNT(*) AS cnt FROM vehicle WHERE VEHICLE_STATUS = 'On Rental'");
$onRental = $r2->fetch_assoc()['cnt'] ?? 0;

// Booked vehicles — Active rentals whose start date is in the future (not yet collected)
$r3     = $conn->query(
    "SELECT COUNT(*) AS cnt FROM rental
     WHERE STATUS = 'Active'
       AND START_DATE > NOW()"
);
$booked = $r3->fetch_assoc()['cnt'] ?? 0;

// Active rentals total (booked + currently out)
$r4            = $conn->query("SELECT COUNT(*) AS cnt FROM rental WHERE STATUS = 'Active'");
$activeRentals = $r4->fetch_assoc()['cnt'] ?? 0;

// Late returns — Active rentals whose expected return date has passed
$r5          = $conn->query(
    "SELECT COUNT(*) AS cnt FROM rental
     WHERE STATUS = 'Active'
       AND START_DATE <= NOW()
       AND RETURN_DATE < NOW()"
);
$lateReturns = $r5->fetch_assoc()['cnt'] ?? 0;

echo json_encode([
    'status' => 'success',
    'stats'  => [
        'available'      => (int)$available,
        'on_rental'      => (int)$onRental,
        'booked'         => (int)$booked,
        'active_rentals' => (int)$activeRentals,
        'late_returns'   => (int)$lateReturns,
    ]
]);

$conn->close();
?>