<?php
// ============================================================
//  DARKETZ Car Rental — Dashboard Stats
//  GET  → returns live counts for the 4 stat cards
//
//  Schema column mapping (old → actual DB):
//    VEHICLE_STATUS       → VEHICLE_STATUS          (same)
//    RENTAL.EX_RETURN_DATE→ rental.RETURN_DATE
//    RE_TURN.RETURN_ID    → re_turn.RETURN_ID        (same)
//    RENTAL.RENTAL_ID     → rental.RENTAL_ID         (same)
// ============================================================

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header('Access-Control-Allow-Credentials: true');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header("Access-Control-Allow-Methods: GET, OPTIONS");
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");
    exit(0);
}

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