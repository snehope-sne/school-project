<?php
require_once 'db_connection.php';

error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');

require_once 'db_connection.php';

$action = strtolower(trim($_GET['action'] ?? $_POST['action'] ?? ''));

// ── LIST RENTALS ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {

    $result = $conn->query(
        "SELECT rn.RENTAL_ID,
                rn.PURPOSE,
                rn.START_DATE,
                rn.RETURN_DATE,
                rn.MILEAGE_ACCESSORY,
                rn.STATUS,
                c.Cust_National_ID                             AS CUST_ID,
                CONCAT(c.First_Name, ' ', c.Last_Name)         AS CUSTOMER_NAME,
                v.VIN                                          AS VEHICLE_ID,
                CONCAT(v.BRAND, ' ', v.MAKE)                   AS VEHICLE_NAME,
                v.PLATE_NUMBER,
                v.DAILY_RATE,
                rt.RETURN_ID,
                rt.ACTUAL_DATE,
                rt.IS_LATE,
                CASE
                    WHEN rn.STATUS = 'Cancelled'                          THEN 'Cancelled'
                    WHEN rt.RETURN_ID IS NOT NULL AND rt.IS_LATE = 1      THEN 'Returned Late'
                    WHEN rt.RETURN_ID IS NOT NULL                         THEN 'Returned'
                    WHEN v.VEHICLE_STATUS = 'Booked'                      THEN 'Booked'
                    WHEN v.VEHICLE_STATUS = 'On Rental'
                         AND NOW() > rn.RETURN_DATE                       THEN 'Late'
                    WHEN v.VEHICLE_STATUS = 'On Rental'                   THEN 'On Rental'
                    WHEN v.VEHICLE_STATUS = 'Maintenance'                 THEN 'Maintenance'
                    ELSE rn.STATUS
                END AS RENTAL_STATUS
         FROM rental rn
         INNER JOIN customer c  ON c.Cust_National_ID = rn.CUST_ID
         INNER JOIN vehicle  v  ON v.VIN              = rn.VIN
         LEFT  JOIN re_turn  rt ON rt.RENTAL_ID       = rn.RENTAL_ID
         ORDER BY rn.RENTAL_ID DESC"
    );

    $rentals = [];
    while ($r = $result->fetch_assoc()) {
        $days  = max(1, (int)ceil((strtotime($r['RETURN_DATE']) - strtotime($r['START_DATE'])) / 86400));
        $total = $days * (float)$r['DAILY_RATE'];

        $rentals[] = [
            'rental_id'      => (int)$r['RENTAL_ID'],
            'customer'       => $r['CUSTOMER_NAME'],
            'cust_id'        => $r['CUST_ID'],
            'vehicle'        => $r['VEHICLE_NAME'],
            'vehicle_id'     => $r['VEHICLE_ID'],   // VIN string
            'plate'          => $r['PLATE_NUMBER'],
            'start'          => $r['START_DATE'],
            'expected_return'=> $r['RETURN_DATE'],
            'purpose'        => $r['PURPOSE'],
            'mileage'        => $r['MILEAGE_ACCESSORY'],
            'status'         => $r['RENTAL_STATUS'],   // Available | On Rental | Maintenance
            'amount'         => round($total, 2),
            'actual_return'  => $r['ACTUAL_DATE'],
            'is_late'        => $r['ACTUAL_DATE'] && $r['ACTUAL_DATE'] > $r['RETURN_DATE'],
        ];
    }

    echo json_encode(['status' => 'success', 'rentals' => $rentals]);
    $conn->close(); exit();
}

// ── CREATE RENTAL ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'create') {

    $raw  = file_get_contents('php://input');
    $json = json_decode($raw, true);
    $get  = fn($k) => trim($json[$k] ?? $_POST[$k] ?? '');

    // Accept 'vin' or legacy 'vehicle_id' from the front-end
    $cust_id     = $get('cust_id');
    $vin         = $get('vin') ?: $get('vehicle_id');
    $start_date  = $get('start_date');
    $return_date = $get('return_date') ?: $get('ex_return_date');   // accept either key
    $purpose     = $get('purpose');
    $mileage     = $get('mileage');
    $emp_id      = (int)$get('emp_id');

    $errors = [];
    if (!$cust_id)     $errors[] = 'Customer ID is required.';
    if (!$vin)         $errors[] = 'Vehicle VIN is required.';
    if (!$start_date)  $errors[] = 'Start date is required.';
    if (!$return_date) $errors[] = 'Return date is required.';
    if (!$purpose)     $errors[] = 'Purpose is required.';
    if (!$emp_id)      $errors[] = 'Employee ID is required.';

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        exit();
    }

    if (strtotime($return_date) <= strtotime($start_date)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Return date must be after start date.']);
        exit();
    }

    $conn->begin_transaction();
    try {
        // Verify vehicle is available (row lock) — PK is VIN
        $vstmt = $conn->prepare("SELECT VEHICLE_STATUS FROM vehicle WHERE VIN = ? FOR UPDATE");
        $vstmt->bind_param("s", $vin);
        $vstmt->execute();
        $vrow = $vstmt->get_result()->fetch_assoc();
        $vstmt->close();

        if (!$vrow) throw new Exception('Vehicle not found.', 404);
        if ($vrow['VEHICLE_STATUS'] !== 'Available') {
            throw new Exception('Vehicle is no longer available.', 409);
        }

        // Verify customer exists — PK is Cust_National_ID
        $cstmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ? LIMIT 1");
        $cstmt->bind_param("s", $cust_id);
        $cstmt->execute();
        if ($cstmt->get_result()->num_rows === 0) throw new Exception('Customer not found.', 404);
        $cstmt->close();

        // Verify employee exists in the employee table
        $estmt = $conn->prepare("SELECT EMP_ID FROM employee WHERE EMP_ID = ? LIMIT 1");
        $estmt->bind_param("i", $emp_id);
        $estmt->execute();
        if ($estmt->get_result()->num_rows === 0) throw new Exception('Employee not found.', 404);
        $estmt->close();

        // Insert rental record
        // Columns: VIN (not VEHICLE_ID), CUST_ID (FK to Cust_National_ID), RETURN_DATE (not EX_RETURN_DATE)
        $stmt = $conn->prepare(
            "INSERT INTO rental (PURPOSE, START_DATE, RETURN_DATE, MILEAGE_ACCESSORY,
                                 VIN, CUST_ID, EMP_ID, STATUS, DATE_BOOKED)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', NOW())"
        );
        if ($stmt === false) throw new Exception('DB error preparing rental insert.');
        $stmt->bind_param("ssssssi", $purpose, $start_date, $return_date, $mileage,
                                     $vin, $cust_id, $emp_id);
        if (!$stmt->execute()) throw new Exception('Failed to create rental: ' . $stmt->error);
        $rental_id = $conn->insert_id;
        $stmt->close();

        // Mark vehicle as On Rental
        $upd = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = 'On Rental' WHERE VIN = ?");
        $upd->bind_param("s", $vin);
        $upd->execute();
        $upd->close();

        $conn->commit();

        // Fetch full rental details for confirmation
        $res = $conn->query(
            "SELECT rn.RENTAL_ID,
                    CONCAT(c.First_Name,' ',c.Last_Name)   AS CUSTOMER_NAME,
                    CONCAT(v.BRAND,' ',v.MAKE)             AS VEHICLE_NAME,
                    v.PLATE_NUMBER, v.DAILY_RATE,
                    rn.START_DATE, rn.RETURN_DATE, rn.PURPOSE
             FROM rental rn
             INNER JOIN customer c ON c.Cust_National_ID = rn.CUST_ID
             INNER JOIN vehicle  v ON v.VIN              = rn.VIN
             WHERE rn.RENTAL_ID = $rental_id"
        );
        $detail = $res->fetch_assoc();
        $days   = max(1, (int)ceil((strtotime($detail['RETURN_DATE']) - strtotime($detail['START_DATE'])) / 86400));
        $total  = $days * (float)$detail['DAILY_RATE'];

        http_response_code(201);
        echo json_encode([
            'status'    => 'success',
            'message'   => "Rental #$rental_id confirmed. Keys handed over.",
            'rental_id' => $rental_id,
            'rental'    => [
                'rental_id'      => $rental_id,
                'customer'       => $detail['CUSTOMER_NAME'],
                'vehicle'        => $detail['VEHICLE_NAME'],
                'plate'          => $detail['PLATE_NUMBER'],
                'start'          => $detail['START_DATE'],
                'expected_return'=> $detail['RETURN_DATE'],
                'purpose'        => $detail['PURPOSE'],
                'days'           => $days,
                'daily_rate'     => (float)$detail['DAILY_RATE'],
                'total'          => round($total, 2),
            ]
        ]);

    } catch (Throwable $e) {
        $conn->rollback();
        $code = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
        http_response_code($code);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

    $conn->close(); exit();
}

// ── LOOKUP CUSTOMER BOOKING ──────────────────────────────────
// GET ?action=lookup_booking&cust_id=...
// Returns the customer's most recent active 'Booked' rental (if any),
// including vehicle info, license details, and the 72-hour expiry time.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'lookup_booking') {

    $cust_id = trim($_GET['cust_id'] ?? '');

    if (!$cust_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'cust_id is required.']);
        $conn->close(); exit();
    }

    // First auto-expire any stale bookings for this customer before looking up
    $expireStmt = $conn->prepare("
        UPDATE rental r
        JOIN   vehicle v ON v.VIN = r.VIN
        SET    r.STATUS         = 'Cancelled',
               v.VEHICLE_STATUS = 'Available'
        WHERE  r.CUST_ID = ?
          AND  r.STATUS   = 'Active'
          AND  v.VEHICLE_STATUS = 'Booked'
          AND  DATE_ADD(r.DATE_BOOKED, INTERVAL 72 HOUR) < NOW()
    ");
    $expireStmt->bind_param("s", $cust_id);
    $expireStmt->execute();
    $expireStmt->close();

    // Now look up their current valid booking
    $stmt = $conn->prepare("
        SELECT  r.RENTAL_ID,
                r.DATE_BOOKED,
                r.START_DATE,
                r.RETURN_DATE,
                r.STATUS,
                v.VIN,
                v.BRAND,
                v.MAKE,
                v.PLATE_NUMBER,
                v.DAILY_RATE,
                v.IMAGE_URL,
                v.VEHICLE_STATUS,
                c.First_Name,
                c.Last_Name,
                c.Cust_National_ID,
                c.Phone,
                c.Email,
                l.License_No,
                l.Front_Img_URL,
                l.Back_Img_URL
        FROM    rental r
        JOIN    vehicle  v ON v.VIN              = r.VIN
        JOIN    customer c ON c.Cust_National_ID = r.CUST_ID
        LEFT JOIN license l ON l.Cust_National_ID = r.CUST_ID
        WHERE   r.CUST_ID         = ?
          AND   r.STATUS          = 'Active'
          AND   v.VEHICLE_STATUS  = 'Booked'
        ORDER  BY r.RENTAL_ID DESC
        LIMIT  1
    ");
    $stmt->bind_param("s", $cust_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        echo json_encode(['status' => 'no_booking', 'message' => 'No active booking found for this customer.']);
        $conn->close(); exit();
    }

    // Calculate expiry: DATE_BOOKED + 72 hours
    $booked_ts  = strtotime($row['DATE_BOOKED']);
    $expiry_ts  = $booked_ts + (72 * 3600);
    $expiry_dt  = date('Y-m-d H:i:s', $expiry_ts);
    $now_ts     = time();
    $remaining_seconds = max(0, $expiry_ts - $now_ts);
    $remaining_hours   = floor($remaining_seconds / 3600);
    $remaining_mins    = floor(($remaining_seconds % 3600) / 60);

    // Days and total for the rental period
    $days  = max(1, (int)ceil((strtotime($row['RETURN_DATE']) - strtotime($row['START_DATE'])) / 86400));
    $total = $days * (float)$row['DAILY_RATE'];

    echo json_encode([
        'status'  => 'success',
        'booking' => [
            'rental_id'         => (int)$row['RENTAL_ID'],
            'date_booked'       => $row['DATE_BOOKED'],
            'booking_expiry'    => $expiry_dt,
            'remaining_seconds' => $remaining_seconds,
            'remaining_label'   => $remaining_hours . 'h ' . $remaining_mins . 'm remaining',
            'start_date'        => $row['START_DATE'],
            'return_date'       => $row['RETURN_DATE'],
            'days'              => $days,
            'total'             => round($total, 2),
            // Vehicle
            'vin'               => $row['VIN'],
            'brand'             => $row['BRAND'],
            'make'              => $row['MAKE'],
            'plate'             => $row['PLATE_NUMBER'],
            'daily_rate'        => (float)$row['DAILY_RATE'],
            'image_url'         => $row['IMAGE_URL'] ?: '',
            // Customer
            'cust_id'           => $row['Cust_National_ID'],
            'cust_name'         => $row['First_Name'] . ' ' . $row['Last_Name'],
            'cust_phone'        => $row['Phone'],
            'cust_email'        => $row['Email'],
            // License
            'license_no'        => $row['License_No']    ?: 'Provided',
            'license_front_url' => $row['Front_Img_URL'] ?: '',
            'license_back_url'  => $row['Back_Img_URL']  ?: '',
            'license_status'    => $row['License_No'] ? 'Provided' : 'Provided',
        ]
    ]);
    $conn->close(); exit();
}

// ── EXPIRE STALE BOOKINGS (global sweep) ─────────────────────
// GET ?action=expire_bookings
// Called by the dashboard on load to clean up any bookings older than 72 hours.
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'expire_bookings') {

    // Cancel all Active rentals where vehicle is still 'Booked' and 72h has passed
    $result = $conn->query("
        SELECT r.RENTAL_ID, r.VIN
        FROM   rental r
        JOIN   vehicle v ON v.VIN = r.VIN
        WHERE  r.STATUS          = 'Active'
          AND  v.VEHICLE_STATUS  = 'Booked'
          AND  DATE_ADD(r.DATE_BOOKED, INTERVAL 72 HOUR) < NOW()
    ");

    $cancelled = 0;
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $rid = (int)$row['RENTAL_ID'];
            $vin = $row['VIN'];

            $conn->query("UPDATE rental  SET STATUS         = 'Cancelled'  WHERE RENTAL_ID = $rid");
            $conn->query("UPDATE vehicle SET VEHICLE_STATUS = 'Available'  WHERE VIN = '$vin'");
            $cancelled++;
        }
    }

    echo json_encode([
        'status'    => 'success',
        'cancelled' => $cancelled,
        'message'   => "$cancelled expired booking(s) auto-cancelled."
    ]);
    $conn->close(); exit();
}

// ── CONVERT BOOKING TO RENTAL (admin confirms pickup + payment) ──
// POST ?action=activate
// Body: rental_id, emp_id, mileage (optional)
// Changes an existing 'Booked' rental to 'On Rental' status.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'activate') {

    $raw  = file_get_contents('php://input');
    $json = json_decode($raw, true);
    $get  = fn($k) => trim($json[$k] ?? $_POST[$k] ?? '');

    $rental_id = (int)$get('rental_id');
    $emp_id    = (int)$get('emp_id');
    $mileage   = $get('mileage');

    if (!$rental_id || !$emp_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id and emp_id are required.']);
        $conn->close(); exit();
    }

    // Fetch the rental + vehicle status
    $fetchStmt = $conn->prepare("
        SELECT r.VIN, r.STATUS, r.CUST_ID, v.VEHICLE_STATUS,
               CONCAT(c.First_Name,' ',c.Last_Name) AS CUST_NAME,
               CONCAT(v.BRAND,' ',v.MAKE) AS VEH_NAME
        FROM   rental r
        JOIN   vehicle  v ON v.VIN              = r.VIN
        JOIN   customer c ON c.Cust_National_ID = r.CUST_ID
        WHERE  r.RENTAL_ID = ?
        LIMIT  1
    ");
    $fetchStmt->bind_param("i", $rental_id);
    $fetchStmt->execute();
    $bRow = $fetchStmt->get_result()->fetch_assoc();
    $fetchStmt->close();

    if (!$bRow) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Rental not found.']);
        $conn->close(); exit();
    }

    if ($bRow['STATUS'] !== 'Active' || $bRow['VEHICLE_STATUS'] !== 'Booked') {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'This rental is not in a Booked state. Current status: ' . $bRow['STATUS'] . ' / ' . $bRow['VEHICLE_STATUS']]);
        $conn->close(); exit();
    }

    $conn->begin_transaction();
    try {
        // Update rental: assign employee, update mileage, keep STATUS Active (now truly On Rental)
        $updR = $conn->prepare("
            UPDATE rental
            SET    EMP_ID             = ?,
                   MILEAGE_ACCESSORY  = ?,
                   START_DATE         = NOW()
            WHERE  RENTAL_ID = ?
        ");
        $updR->bind_param("isi", $emp_id, $mileage, $rental_id);
        if (!$updR->execute()) throw new Exception('Failed to update rental: ' . $updR->error);
        $updR->close();

        // Mark vehicle as On Rental
        $updV = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = 'On Rental' WHERE VIN = ?");
        $updV->bind_param("s", $bRow['VIN']);
        $updV->execute();
        $updV->close();

        $conn->commit();

        echo json_encode([
            'status'  => 'success',
            'message' => "Rental #{$rental_id} activated. {$bRow['VEH_NAME']} is now On Rental for {$bRow['CUST_NAME']}.",
        ]);
    } catch (Throwable $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

    $conn->close(); exit();
}

// ── Fallback ────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>