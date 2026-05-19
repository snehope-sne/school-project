<?php
require_once 'db_connection.php';
error_reporting(E_ALL);
ini_set('display_errors', 0);
set_exception_handler(function($e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');



$action = strtolower(trim($_GET['action'] ?? $_POST['action'] ?? ''));

// ── PENDING RETURNS ──────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'pending') {

    $result = $conn->query(
        "SELECT rn.RENTAL_ID,
                rn.START_DATE,
                rn.RETURN_DATE,
                rn.PURPOSE,
                CONCAT(c.First_Name, ' ', c.Last_Name) AS CUSTOMER_NAME,
                CONCAT(v.BRAND, ' ', v.MAKE)           AS VEHICLE_NAME,
                v.PLATE_NUMBER,
                v.DAILY_RATE,
                v.VIN                                  AS VEHICLE_ID,
                TIMESTAMPDIFF(HOUR, rn.RETURN_DATE, NOW()) AS HOURS_LATE
         FROM rental rn
         INNER JOIN customer c  ON c.Cust_National_ID = rn.CUST_ID
         INNER JOIN vehicle  v  ON v.VIN              = rn.VIN
         WHERE rn.STATUS = 'Active'
         ORDER BY rn.RETURN_DATE ASC"
    );

    $pending = [];
    while ($r = $result->fetch_assoc()) {
        $hoursLate = max(0, (int)$r['HOURS_LATE']);
        $daysLate  = (int)ceil($hoursLate / 24);
        $isLate    = $hoursLate > 0;

        // Try to look up fee from charge table
        $lateFee = 0;
        if ($isLate) {
            $lateFee = lookupLateFee($conn, $hoursLate, (float)$r['DAILY_RATE']);
            // Fall back to 1.5× daily multiplier if table not populated
            if ($lateFee === null) {
                $lateFee = round(max(1, $daysLate) * (float)$r['DAILY_RATE'] * 1.5, 2);
            }
        }

        $days  = max(1, (int)ceil((strtotime($r['RETURN_DATE']) - strtotime($r['START_DATE'])) / 86400));
        $total = $days * (float)$r['DAILY_RATE'];

        $pending[] = [
            'rental_id'       => (int)$r['RENTAL_ID'],
            'customer'        => $r['CUSTOMER_NAME'],
            'vehicle'         => $r['VEHICLE_NAME'],
            'vehicle_id'      => $r['VEHICLE_ID'],
            'plate'           => $r['PLATE_NUMBER'],
            'start'           => $r['START_DATE'],
            'expected_return' => $r['RETURN_DATE'],
            'purpose'         => $r['PURPOSE'],
            'daily_rate'      => (float)$r['DAILY_RATE'],
            'rental_days'     => $days,
            'base_total'      => round($total, 2),
            'is_late'         => $isLate,
            'hours_late'      => $hoursLate,
            'days_late'       => $daysLate,
            'late_fee'        => round((float)$lateFee, 2),
            'grand_total'     => round($total + (float)$lateFee, 2),
        ];
    }

    echo json_encode(['status' => 'success', 'pending' => $pending]);
    $conn->close(); exit();
}

// ── CHARGE TABLE — GET ────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'charge_table') {
    $result = $conn->query(
        "SELECT HOURS_LATE, RATE_BRACKET, CHARGE_AMOUNT
         FROM late_charge_rate
         ORDER BY HOURS_LATE ASC, RATE_BRACKET ASC"
    );
    $rates = [];
    while ($r = $result->fetch_assoc()) $rates[] = $r;
    echo json_encode(['status' => 'success', 'rates' => $rates]);
    $conn->close(); exit();
}

// ── RECEIPT — GET ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'receipt') {
    $rental_id = (int)($_GET['rental_id'] ?? 0);
    if (!$rental_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id is required.']);
        exit();
    }

    // ── Detect which columns exist on re_turn ─────────────────
    // (safe for both before and after running the migration)
    $hasHoursLate  = false;
    $hasLateCharge = false;
    $colCheck = $conn->query("SHOW COLUMNS FROM re_turn");
    if ($colCheck) {
        while ($col = $colCheck->fetch_assoc()) {
            $n = strtoupper($col['Field']);
            if ($n === 'HOURS_LATE')  $hasHoursLate  = true;
            if ($n === 'LATE_CHARGE') $hasLateCharge = true;
        }
    }
    $hoursLateCol  = $hasHoursLate  ? 'rt.HOURS_LATE'  : '0';
    $lateChargeCol = $hasLateCharge ? 'rt.LATE_CHARGE' : '0';

    // ── Detect customer table column names ────────────────────
    // Some installs use Phone/Email/Drivers_Licence, others differ
    $custCols   = [];
    $custCheck  = $conn->query("SHOW COLUMNS FROM customer");
    if ($custCheck) {
        while ($col = $custCheck->fetch_assoc()) $custCols[] = strtolower($col['Field']);
    }
    $phoneCol   = in_array('phone',           $custCols) ? 'c.Phone'           :
                 (in_array('cell',            $custCols) ? 'c.Cell'            : "''");
    $emailCol   = in_array('email',           $custCols) ? 'c.Email'           :
                 (in_array('cust_email',      $custCols) ? 'c.Cust_Email'      : "''");
    $licenceCol = in_array('license_no',      $custCols) ? 'c.License_No'      :
                 (in_array('drivers_licence', $custCols) ? 'c.Drivers_Licence' :
                 (in_array('licence_no',      $custCols) ? 'c.Licence_No'      : "''"));

    $sql = "SELECT
                rn.RENTAL_ID,
                rn.START_DATE,
                rn.RETURN_DATE                              AS EXPECTED_RETURN,
                rn.PURPOSE,
                rn.VIN,
                rt.ACTUAL_DATE,
                rt.IS_LATE,
                {$hoursLateCol}                            AS HOURS_LATE,
                {$lateChargeCol}                           AS LATE_CHARGE,
                rt.COMMENTS,
                rt.RETURN_ID,
                CONCAT(c.First_Name, ' ', c.Last_Name)     AS CUSTOMER_NAME,
                c.Cust_National_ID                         AS CUSTOMER_ID,
                {$phoneCol}                                AS CUSTOMER_PHONE,
                {$emailCol}                                AS CUSTOMER_EMAIL,
                {$licenceCol}                              AS LICENSE_NO,
                CONCAT(v.BRAND, ' ', v.MAKE)               AS VEHICLE_NAME,
                v.PLATE_NUMBER,
                v.DAILY_RATE,
                v.TYPE
             FROM rental rn
             INNER JOIN customer c  ON c.Cust_National_ID = rn.CUST_ID
             INNER JOIN vehicle  v  ON v.VIN              = rn.VIN
             LEFT  JOIN re_turn  rt ON rt.RENTAL_ID       = rn.RENTAL_ID
             WHERE rn.RENTAL_ID = ?
             LIMIT 1";

    $stmt = $conn->prepare($sql);
    if ($stmt === false) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'DB prepare failed: ' . $conn->error]);
        $conn->close(); exit();
    }
    $stmt->bind_param("i", $rental_id);
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'DB execute failed: ' . $stmt->error]);
        $stmt->close(); $conn->close(); exit();
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Rental not found.']);
        $conn->close(); exit();
    }

    $days       = max(1, (int)ceil((strtotime($row['EXPECTED_RETURN']) - strtotime($row['START_DATE'])) / 86400));
    $baseTotal  = $days * (float)$row['DAILY_RATE'];
    $lateFee    = (float)($row['LATE_CHARGE'] ?? 0);
    $grandTotal = $baseTotal + $lateFee;

    echo json_encode([
        'status'  => 'success',
        'receipt' => [
            'rental_id'       => (int)$row['RENTAL_ID'],
            'return_id'       => (int)$row['RETURN_ID'],
            'customer_name'   => $row['CUSTOMER_NAME'],
            'customer_id'     => $row['CUSTOMER_ID'],
            'customer_phone'  => $row['CUSTOMER_PHONE'] ?? '',
            'customer_email'  => $row['CUSTOMER_EMAIL'] ?? '',
            'license_no'      => $row['LICENSE_NO'] ?? '',
            'vehicle_name'    => $row['VEHICLE_NAME'],
            'plate'           => $row['PLATE_NUMBER'],
            'vin'             => $row['VIN'],
            'vehicle_type'    => $row['TYPE'] ?? '',
            'purpose'         => $row['PURPOSE'] ?? '',
            'start_date'      => $row['START_DATE'],
            'expected_return' => $row['EXPECTED_RETURN'],
            'actual_return'   => $row['ACTUAL_DATE'],
            'rental_days'     => $days,
            'daily_rate'      => (float)$row['DAILY_RATE'],
            'base_total'      => round($baseTotal, 2),
            'is_late'         => (bool)$row['IS_LATE'],
            'hours_late'      => (int)($row['HOURS_LATE'] ?? 0),
            'late_fee'        => round($lateFee, 2),
            'grand_total'     => round($grandTotal, 2),
            'comments'        => $row['COMMENTS'] ?? '',
        ]
    ]);
    $conn->close(); exit();
}

// ── PROCESS RETURN ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'process') {

    $raw  = file_get_contents('php://input');
    $json = json_decode($raw, true);
    $get  = fn($k) => trim($json[$k] ?? $_POST[$k] ?? '');

    $rental_id   = (int)$get('rental_id');
    $comments    = $get('comments');
    $actual_date = $get('actual_date') ?: date('Y-m-d H:i:s');
    $late_charge = (float)($json['late_charge'] ?? $_POST['late_charge'] ?? 0);

    if (!$rental_id) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'rental_id is required.']);
        exit();
    }

    $conn->begin_transaction();
    try {
        // Verify rental exists and not yet returned (row lock)
        $chk = $conn->prepare(
            "SELECT rn.RENTAL_ID, rn.RETURN_DATE, rn.VIN, rt.RETURN_ID
             FROM rental rn
             LEFT JOIN re_turn rt ON rt.RENTAL_ID = rn.RENTAL_ID
             WHERE rn.RENTAL_ID = ?
             FOR UPDATE"
        );
        $chk->bind_param("i", $rental_id);
        $chk->execute();
        $row = $chk->get_result()->fetch_assoc();
        $chk->close();

        if (!$row) throw new Exception('Rental not found.', 404);
        if ($row['RETURN_ID']) throw new Exception('This rental has already been returned.', 409);

        $vin       = $row['VIN'];
        $isLate    = strtotime($actual_date) > strtotime($row['RETURN_DATE']);
        $hoursLate = $isLate
            ? (int)ceil((strtotime($actual_date) - strtotime($row['RETURN_DATE'])) / 3600)
            : 0;
        $isLateBool = $isLate ? 1 : 0;

        // If no late_charge supplied but vehicle is late, compute from charge table
        if ($isLate && $late_charge <= 0) {
            // Need daily rate
            $vStmt = $conn->prepare("SELECT DAILY_RATE FROM vehicle WHERE VIN = ?");
            $vStmt->bind_param("s", $vin);
            $vStmt->execute();
            $vRow = $vStmt->get_result()->fetch_assoc();
            $vStmt->close();
            $dr = (float)($vRow['DAILY_RATE'] ?? 0);
            $computed = lookupLateFee($conn, $hoursLate, $dr);
            $late_charge = $computed !== null ? $computed : round($dr * 1.5 * max(1, ceil($hoursLate/24)), 2);
        }

        // ── Detect which columns exist on re_turn ─────────────
        $hasHL = false; $hasLC = false;
        $cc = $conn->query("SHOW COLUMNS FROM re_turn");
        if ($cc) { while ($col = $cc->fetch_assoc()) {
            $n = strtoupper($col['Field']);
            if ($n === 'HOURS_LATE')  $hasHL = true;
            if ($n === 'LATE_CHARGE') $hasLC = true;
        }}

        // Insert re_turn record — use extended columns if migration has run
        if ($hasHL && $hasLC) {
            $stmt = $conn->prepare(
                "INSERT INTO re_turn (COMMENTS, ACTUAL_DATE, IS_LATE, HOURS_LATE, LATE_CHARGE, RENTAL_ID)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );
            if ($stmt === false) throw new Exception('DB error on return insert: ' . $conn->error);
            $stmt->bind_param("ssiidi", $comments, $actual_date, $isLateBool, $hoursLate, $late_charge, $rental_id);
        } else {
            // Fallback: original 4-column insert (migration not yet run)
            $stmt = $conn->prepare(
                "INSERT INTO re_turn (COMMENTS, ACTUAL_DATE, IS_LATE, RENTAL_ID)
                 VALUES (?, ?, ?, ?)"
            );
            if ($stmt === false) throw new Exception('DB error on return insert: ' . $conn->error);
            $stmt->bind_param("ssii", $comments, $actual_date, $isLateBool, $rental_id);
        }
        if (!$stmt->execute()) throw new Exception('Failed to record return: ' . $stmt->error);
        $return_id = $conn->insert_id;
        $stmt->close();

        // Update rental STATUS to 'Returned'
        $upds = $conn->prepare("UPDATE rental SET STATUS = 'Returned' WHERE RENTAL_ID = ?");
        $upds->bind_param("i", $rental_id);
        $upds->execute();
        $upds->close();

        // Mark vehicle Available again
        $upd = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = 'Available' WHERE VIN = ?");
        $upd->bind_param("s", $vin);
        $upd->execute();
        $upd->close();

        $conn->commit();

        $msg = $isLate
            ? "Return processed. Vehicle was {$hoursLate} hour(s) late. Late fee: E " . number_format($late_charge, 2) . "."
            : "Return processed. Vehicle is back in the fleet.";

        echo json_encode([
            'status'     => 'success',
            'message'    => $msg,
            'return_id'  => $return_id,
            'is_late'    => $isLate,
            'hours_late' => $hoursLate,
            'late_charge'=> $late_charge,
        ]);

    } catch (Throwable $e) {
        $conn->rollback();
        $code = ($e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
        http_response_code($code);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }

    $conn->close(); exit();
}

// ── SAVE CHARGE TABLE ─────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'save_charge_table') {
    $raw  = file_get_contents('php://input');
    $rows = json_decode($raw, true);

    if (!is_array($rows) || empty($rows)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'No rows provided.']);
        exit();
    }

    $stmt = $conn->prepare(
        "INSERT INTO late_charge_rate (HOURS_LATE, RATE_BRACKET, CHARGE_AMOUNT)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE CHARGE_AMOUNT = VALUES(CHARGE_AMOUNT)"
    );

    $saved  = 0;
    $errors = 0;
    foreach ($rows as $r) {
        $h  = (int)($r['hours_late']    ?? 0);
        $b  = (float)($r['rate_bracket']  ?? 0);
        $ca = (float)($r['charge_amount'] ?? 0);
        if ($h < 1 || $h > 4 || $b <= 0) { $errors++; continue; }
        $stmt->bind_param("idd", $h, $b, $ca);
        $stmt->execute() ? $saved++ : $errors++;
    }
    $stmt->close();

    $status = $errors === 0 ? 'success' : ($saved > 0 ? 'partial' : 'error');
    echo json_encode([
        'status'  => $status,
        'message' => "$saved row(s) saved" . ($errors ? ", $errors error(s)." : '.'),
    ]);
    $conn->close(); exit();
}

// ── Helper: look up fee from late_charge_rate ─────────────────
function lookupLateFee(mysqli $conn, int $hoursLate, float $dailyRate): ?float {
    // Hours beyond 4 → charge for extra full days on top
    $extraDays = 0;
    $lookupH   = $hoursLate;
    if ($hoursLate > 4) {
        $extraDays = (int)floor(($hoursLate - 1) / 24);
        $lookupH   = min(4, $hoursLate - ($extraDays * 24));
        if ($lookupH < 1) $lookupH = 1;
    }
    $lookupH = max(1, min(4, $lookupH));

    // Find the closest bracket ≤ dailyRate
    $stmt = $conn->prepare(
        "SELECT CHARGE_AMOUNT FROM late_charge_rate
         WHERE HOURS_LATE = ? AND RATE_BRACKET <= ?
         ORDER BY RATE_BRACKET DESC
         LIMIT 1"
    );
    $stmt->bind_param("id", $lookupH, $dailyRate);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) return null;

    $fee = (float)$row['CHARGE_AMOUNT'];
    if ($extraDays > 0) $fee += $extraDays * $dailyRate;
    return round($fee, 2);
}

// ── Fallback ──────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>