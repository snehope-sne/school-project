<?php
// ============================================================
//  DARKETZ Car Rental — Reports
//  GET ?action=revenue | fleet | customers | late_returns
//
//  Schema column mapping (old → actual DB):
//    VEHICLE.VEHICLE_ID   → vehicle.VIN             (VARCHAR PK)
//    RENTAL.EX_RETURN_DATE→ rental.RETURN_DATE
//    RENTAL.VEHICLE_ID    → rental.VIN
//    CUSTOMER.CUST_ID     → customer.Cust_National_ID
//    CUSTOMER.CUST_FNAME  → customer.First_Name
//    CUSTOMER.CUST_LNAME  → customer.Last_Name
//    CUSTOMER.ID_NO       → customer.Cust_National_ID
//    CUSTOMER.IS_VERIFIED → customer.Is_Verified
//    LATE_RETURN table    → does not exist in new schema;
//                           late detection uses re_turn.IS_LATE + RETURN_DATE vs ACTUAL_DATE
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

$action = strtolower(trim($_GET['action'] ?? ''));

// ── REVENUE REPORT ───────────────────────────────────────────
if ($action === 'revenue') {
    // Monthly revenue from completed rentals (daily_rate × days)
    $result = $conn->query(
        "SELECT DATE_FORMAT(rn.START_DATE, '%Y-%m') AS month,
                SUM(
                    DATEDIFF(rn.RETURN_DATE, rn.START_DATE) * v.DAILY_RATE
                ) AS total_revenue,
                COUNT(rn.RENTAL_ID) AS total_rentals
         FROM rental rn
         INNER JOIN vehicle  v  ON v.VIN       = rn.VIN
         INNER JOIN re_turn  rt ON rt.RENTAL_ID = rn.RENTAL_ID
         GROUP BY month
         ORDER BY month DESC
         LIMIT 12"
    );
    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $rows[] = [
            'month'         => $r['month'],
            'total_revenue' => (float)$r['total_revenue'],
            'total_rentals' => (int)$r['total_rentals'],
        ];
    }
    echo json_encode(['status' => 'success', 'report' => 'revenue', 'data' => $rows]);
    $conn->close(); exit();
}

// ── FLEET UTILISATION ────────────────────────────────────────
if ($action === 'fleet') {
    $result = $conn->query(
        "SELECT v.VIN                                          AS VEHICLE_ID,
                CONCAT(v.BRAND,' ',v.MAKE,' ',v.MODEL_YEAR)   AS vehicle_name,
                v.PLATE_NUMBER,
                v.CATEGORY,
                v.VEHICLE_STATUS,
                v.DAILY_RATE,
                COUNT(rn.RENTAL_ID)                           AS total_rentals,
                COALESCE(SUM(DATEDIFF(rn.RETURN_DATE, rn.START_DATE)), 0) AS total_days_rented
         FROM vehicle v
         LEFT JOIN rental rn ON rn.VIN = v.VIN
         GROUP BY v.VIN
         ORDER BY total_rentals DESC"
    );
    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $rows[] = [
            'vehicle_id'       => $r['VEHICLE_ID'],   // VIN string
            'vehicle'          => $r['vehicle_name'],
            'plate'            => $r['PLATE_NUMBER'],
            'category'         => $r['CATEGORY'],
            'status'           => $r['VEHICLE_STATUS'],
            'daily_rate'       => (float)$r['DAILY_RATE'],
            'total_rentals'    => (int)$r['total_rentals'],
            'total_days_rented'=> (int)$r['total_days_rented'],
            'estimated_revenue'=> round($r['total_days_rented'] * $r['DAILY_RATE'], 2),
        ];
    }
    echo json_encode(['status' => 'success', 'report' => 'fleet', 'data' => $rows]);
    $conn->close(); exit();
}

// ── CUSTOMERS REPORT ─────────────────────────────────────────
if ($action === 'customers') {
    $result = $conn->query(
        "SELECT c.Cust_National_ID,
                CONCAT(c.First_Name,' ',c.Last_Name) AS full_name,
                c.Email,
                c.Phone,
                c.Is_Verified,
                COUNT(rn.RENTAL_ID)                                                       AS total_rentals,
                COALESCE(SUM(DATEDIFF(rn.RETURN_DATE, rn.START_DATE) * v.DAILY_RATE), 0) AS total_spent
         FROM customer c
         LEFT JOIN rental  rn ON rn.CUST_ID = c.Cust_National_ID
         LEFT JOIN vehicle v  ON v.VIN       = rn.VIN
         GROUP BY c.Cust_National_ID
         ORDER BY total_spent DESC"
    );
    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $rows[] = [
            'cust_id'       => $r['Cust_National_ID'],
            'name'          => $r['full_name'],
            'email'         => $r['Email'],
            'phone'         => $r['Phone'],
            'id_no'         => $r['Cust_National_ID'],
            'is_verified'   => (bool)$r['Is_Verified'],
            'total_rentals' => (int)$r['total_rentals'],
            'total_spent'   => (float)$r['total_spent'],
        ];
    }
    echo json_encode(['status' => 'success', 'report' => 'customers', 'data' => $rows]);
    $conn->close(); exit();
}

// ── LATE RETURNS REPORT ──────────────────────────────────────
// NOTE: The updated schema has no LATE_RETURN table.
//       Late info is derived from re_turn.IS_LATE and comparing
//       re_turn.ACTUAL_DATE vs rental.RETURN_DATE.
if ($action === 'late_returns') {
    $result = $conn->query(
        "SELECT rn.RENTAL_ID,
                CONCAT(c.First_Name,' ',c.Last_Name)   AS customer_name,
                c.Phone                                AS customer_phone,
                CONCAT(v.BRAND,' ',v.MAKE)             AS vehicle_name,
                v.PLATE_NUMBER,
                v.DAILY_RATE,
                rn.RETURN_DATE                         AS EX_RETURN_DATE,
                rt.ACTUAL_DATE,
                TIMESTAMPDIFF(HOUR, rn.RETURN_DATE, rt.ACTUAL_DATE) AS HRS_LATE,
                CEIL(TIMESTAMPDIFF(HOUR, rn.RETURN_DATE, rt.ACTUAL_DATE) / 24) AS days_late,
                ROUND(
                    CEIL(TIMESTAMPDIFF(HOUR, rn.RETURN_DATE, rt.ACTUAL_DATE) / 24)
                    * v.DAILY_RATE * 1.5
                , 2) AS late_fee
         FROM re_turn rt
         INNER JOIN rental   rn ON rn.RENTAL_ID        = rt.RENTAL_ID
         INNER JOIN customer c  ON c.Cust_National_ID  = rn.CUST_ID
         INNER JOIN vehicle  v  ON v.VIN               = rn.VIN
         WHERE rt.IS_LATE = 1
           AND rt.ACTUAL_DATE > rn.RETURN_DATE
         ORDER BY HRS_LATE DESC"
    );
    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $rows[] = [
            'rental_id'      => (int)$r['RENTAL_ID'],
            'customer'       => $r['customer_name'],
            'customer_phone' => $r['customer_phone'],
            'vehicle'        => $r['vehicle_name'],
            'plate'          => $r['PLATE_NUMBER'],
            'daily_rate'     => (float)$r['DAILY_RATE'],
            'expected_return'=> $r['EX_RETURN_DATE'],
            'actual_return'  => $r['ACTUAL_DATE'],
            'hours_late'     => (int)$r['HRS_LATE'],
            'days_late'      => (int)$r['days_late'],
            'late_fee'       => (float)$r['late_fee'],
        ];
    }
    echo json_encode(['status' => 'success', 'report' => 'late_returns', 'data' => $rows]);
    $conn->close(); exit();
}

// ── Fallback ────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown report action. Use: revenue, fleet, customers, late_returns.']);
$conn->close();
?>