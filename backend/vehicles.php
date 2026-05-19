<?php
require_once 'db_connection.php';
error_reporting(E_ALL);
ini_set('display_errors', 0);  // MUST be 0 — PHP notices printed to output corrupt JSON
ini_set('log_errors', 1);          // errors go to server error log instead
header('Content-Type: application/json');



$action = strtolower(trim($_GET['action'] ?? $_POST['action'] ?? ''));

// ── Shared helper: fetch vehicle rows ──────────────────────
// DB columns: VIN, PLATE_NUMBER, BRAND, MAKE, MODEL_YEAR, YEAR_OF_MANU,
//             TYPE, CATEGORY, V_CONDITION, DAILY_RATE, SEATS, TRANSMISSION,
//             FUEL_TYPE, ENGINE_SIZE, MILEAGE_RANGE, DRIVE_TYPE, FEATURES,
//             IMAGE_URL, VEHICLE_STATUS
function fetchVehicles($conn, string $whereExtra = ''): array {
    // LEFT JOIN rental to get the active rental's return date for "On Rental" vehicles
    $sql = "SELECT v.VIN, v.BRAND, v.MAKE, v.MODEL_YEAR, v.YEAR_OF_MANU, v.PLATE_NUMBER,
                   v.TYPE, v.V_CONDITION, v.CATEGORY, v.VEHICLE_STATUS,
                   v.DAILY_RATE, v.IMAGE_URL,
                   v.SEATS, v.TRANSMISSION, v.FUEL_TYPE, v.ENGINE_SIZE, v.MILEAGE_RANGE, v.DRIVE_TYPE, v.FEATURES,
                   r.RETURN_DATE AS RENTAL_RETURN_DATE
            FROM vehicle v
            LEFT JOIN rental r
                ON r.VIN = v.VIN
                AND r.STATUS = 'Active'
                AND v.VEHICLE_STATUS = 'On Rental'
            $whereExtra
            ORDER BY v.BRAND ASC";
    $result = $conn->query($sql);
    if (!$result) {
        throw new Exception('Query failed: ' . $conn->error);
    }
    $rows = [];
    while ($r = $result->fetch_assoc()) {
        $rows[] = [
            'id'                  => $r['VIN'],
            'brand'               => $r['BRAND'],
            'make'                => $r['MAKE'],
            'year'                => $r['MODEL_YEAR'],
            'year_of_manu'        => $r['YEAR_OF_MANU'],
            'plate'               => $r['PLATE_NUMBER'],
            'type'                => $r['TYPE'],
            'condition'           => $r['V_CONDITION'],
            'category'            => $r['CATEGORY'],
            'status'              => $r['VEHICLE_STATUS'],
            'rental_return_date'  => $r['RENTAL_RETURN_DATE'] ?? null, // null if not on rental
            'daily_rate'          => (float)$r['DAILY_RATE'],
            'image'               => $r['IMAGE_URL'] ?? '',
            'seats'               => $r['SEATS'] ?? '',
            'transmission'        => $r['TRANSMISSION'] ?? '',
            'fuel'                => $r['FUEL_TYPE'] ?? '',
            'engine'              => $r['ENGINE_SIZE'] ?? '',
            'mileage'             => $r['MILEAGE_RANGE'] ?? '',
            'drive'               => $r['DRIVE_TYPE'] ?? '',
            'features'            => $r['FEATURES'] ? json_decode($r['FEATURES'], true) : [],
        ];
    }
    return $rows;
}

// ── LIST ALL ────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'list') {
    try {
        echo json_encode(['status' => 'success', 'vehicles' => fetchVehicles($conn)]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    $conn->close(); exit();
}

// ── AVAILABLE ONLY ──────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'available') {
    try {
        echo json_encode([
            'status'   => 'success',
            'vehicles' => fetchVehicles($conn, "WHERE VEHICLE_STATUS = 'Available'")
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    $conn->close(); exit();
}

// ── TOGGLE STATUS ───────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'toggle_status') {
    $raw        = file_get_contents('php://input');
    $json       = json_decode($raw, true);
    // vehicle_id is now a VIN (VARCHAR)
    $vin = trim($json['vehicle_id'] ?? $_POST['vehicle_id'] ?? '');

    if (!$vin) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'vehicle_id (VIN) is required.']);
        exit();
    }

    $stmt = $conn->prepare("SELECT VEHICLE_STATUS FROM vehicle WHERE VIN = ? LIMIT 1");
    $stmt->bind_param("s", $vin);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Vehicle not found.']);
        exit();
    }

    if ($row['VEHICLE_STATUS'] === 'On Rental') {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'Cannot change status of a vehicle on rental.']);
        exit();
    }

    $newStatus = ($row['VEHICLE_STATUS'] === 'Maintenance') ? 'Available' : 'Maintenance';
    $stmt = $conn->prepare("UPDATE vehicle SET VEHICLE_STATUS = ? WHERE VIN = ?");
    $stmt->bind_param("ss", $newStatus, $vin);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['status' => 'success', 'message' => "Status updated to $newStatus.", 'new_status' => $newStatus]);
    $conn->close(); exit();
}

// ── ADD VEHICLE ─────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'add') {

    $get = fn($k) => trim($_POST[$k] ?? '');

    // VIN is now supplied by the user (it's the PK)
    $vin          = strtoupper($get('vin'));
    $brand        = $get('brand');
    $make         = $get('make');
    $model_year   = $get('model_year');   // MODEL_YEAR
    $year_of_manu = $get('year_of_manu'); // YEAR_OF_MANU
    $plate        = strtoupper($get('plate'));
    $type         = $get('type');
    $category     = $get('category');
    $condition    = $get('condition');
    $daily_rate   = (float)$get('daily_rate');
    $seats        = (int)$get('seats');
    $transmission = $get('transmission');
    $fuel_type    = $get('fuel');
    $engine_size  = $get('engine');       // ENGINE_SIZE
    $mileage_range= $get('mileage');      // MILEAGE_RANGE
    $drive_type   = $get('drive');
    $features     = $get('features');     // JSON string from JS

    $errors = [];
    if (!$vin)           $errors[] = 'VIN is required.';
    if (!$brand)         $errors[] = 'Brand is required.';
    if (!$make)          $errors[] = 'Make/Model name is required.';
    if (!$plate)         $errors[] = 'Plate number is required.';
    if ($daily_rate <= 0) $errors[] = 'A valid daily rate is required.';

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
        exit();
    }

    // Check duplicate VIN
    $chk = $conn->prepare("SELECT VIN FROM vehicle WHERE VIN = ? LIMIT 1");
    $chk->bind_param("s", $vin);
    $chk->execute();
    if ($chk->get_result()->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'A vehicle with this VIN already exists.']);
        exit();
    }
    $chk->close();

    // Check duplicate plate
    $chk2 = $conn->prepare("SELECT VIN FROM vehicle WHERE PLATE_NUMBER = ? LIMIT 1");
    $chk2->bind_param("s", $plate);
    $chk2->execute();
    if ($chk2->get_result()->num_rows > 0) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'A vehicle with this plate number already exists.']);
        exit();
    }
    $chk2->close();

    // Handle image upload
    $image_url = '';
    if (!empty($_FILES['image']['name']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $upload_dir = __DIR__ . '/uploads/vehicles/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0777, true);
        $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid image type. JPG, PNG, WEBP only.']);
            exit();
        }
        $filename = 'vehicle_' . uniqid() . '.' . $ext;
        if (!move_uploaded_file($_FILES['image']['tmp_name'], $upload_dir . $filename)) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'Failed to save image.']);
            exit();
        }
        $protocol  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
        $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $path      = str_replace(basename(__FILE__), '', $_SERVER['SCRIPT_NAME']);
        $image_url = $protocol . $host . $path . 'uploads/vehicles/' . $filename;
    }

    // INSERT — columns match DB schema exactly
    $stmt = $conn->prepare(
        "INSERT INTO vehicle (VIN, BRAND, MAKE, MODEL_YEAR, YEAR_OF_MANU, PLATE_NUMBER,
                              TYPE, V_CONDITION, CATEGORY, VEHICLE_STATUS, DAILY_RATE, IMAGE_URL,
                              SEATS, TRANSMISSION, FUEL_TYPE, ENGINE_SIZE, MILEAGE_RANGE, DRIVE_TYPE, FEATURES)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    if ($stmt === false) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'DB error: ' . $conn->error]);
        exit();
    }
    // s=VIN, s=brand, s=make, s=model_year, s=year_of_manu, s=plate,
    // s=type, s=condition, s=category, d=daily_rate, s=image_url,
    // i=seats, s=transmission, s=fuel, s=engine_size, s=mileage_range, s=drive, s=features
    $stmt->bind_param("sssssssssdsissssss",
        $vin, $brand, $make, $model_year, $year_of_manu, $plate,
        $type, $condition, $category,
        $daily_rate, $image_url,
        $seats, $transmission, $fuel_type, $engine_size, $mileage_range, $drive_type, $features
    );
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to save vehicle: ' . $stmt->error]);
        exit();
    }
    $stmt->close();

    http_response_code(201);
    echo json_encode([
        'status'    => 'success',
        'message'   => "$brand $make added to fleet.",
        'vehicle_id'=> $vin,
        'image_url' => $image_url,
    ]);
    $conn->close(); exit();
}

// ── EDIT VEHICLE ────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'edit') {

    $get          = fn($k) => trim($_POST[$k] ?? '');
    $vin          = strtoupper($get('vehicle_id')); // VIN is the identifier
    $brand        = $get('brand');
    $make         = $get('make');
    $model_year   = $get('model_year');
    $year_of_manu = $get('year_of_manu');
    $plate        = strtoupper($get('plate'));
    $type         = $get('type');
    $category     = $get('category');
    $condition    = $get('condition');
    $daily_rate   = (float)$get('daily_rate');
    $seats        = (int)$get('seats');
    $transmission = $get('transmission');
    $fuel_type    = $get('fuel');
    $engine_size  = $get('engine');
    $mileage_range= $get('mileage');
    $drive_type   = $get('drive');
    $features     = $get('features');

    if (!$vin) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'vehicle_id (VIN) is required.']);
        exit();
    }

    // Handle optional new image
    $image_url = null;
    if (!empty($_FILES['image']['name']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
        $upload_dir = __DIR__ . '/uploads/vehicles/';
        if (!is_dir($upload_dir)) mkdir($upload_dir, 0777, true);
        $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Invalid image type.']);
            exit();
        }
        $filename  = 'vehicle_' . $vin . '_' . uniqid() . '.' . $ext;
        move_uploaded_file($_FILES['image']['tmp_name'], $upload_dir . $filename);
        $protocol  = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://';
        $host      = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $path      = str_replace(basename(__FILE__), '', $_SERVER['SCRIPT_NAME']);
        $image_url = $protocol . $host . $path . 'uploads/vehicles/' . $filename;
    }

    if ($image_url !== null) {
        $stmt = $conn->prepare(
            "UPDATE vehicle SET BRAND=?, MAKE=?, MODEL_YEAR=?, YEAR_OF_MANU=?, PLATE_NUMBER=?,
             TYPE=?, V_CONDITION=?, CATEGORY=?, DAILY_RATE=?, IMAGE_URL=?,
             SEATS=?, TRANSMISSION=?, FUEL_TYPE=?, ENGINE_SIZE=?, MILEAGE_RANGE=?, DRIVE_TYPE=?, FEATURES=?
             WHERE VIN=?"
        );
        if ($stmt === false) { http_response_code(500); echo json_encode(['status'=>'error','message'=>$conn->error]); exit(); }
        $stmt->bind_param("ssssssssdsisssssss",
            $brand, $make, $model_year, $year_of_manu, $plate,
            $type, $condition, $category, $daily_rate, $image_url,
            $seats, $transmission, $fuel_type, $engine_size, $mileage_range, $drive_type, $features,
            $vin
        );
    } else {
        $stmt = $conn->prepare(
            "UPDATE vehicle SET BRAND=?, MAKE=?, MODEL_YEAR=?, YEAR_OF_MANU=?, PLATE_NUMBER=?,
             TYPE=?, V_CONDITION=?, CATEGORY=?, DAILY_RATE=?,
             SEATS=?, TRANSMISSION=?, FUEL_TYPE=?, ENGINE_SIZE=?, MILEAGE_RANGE=?, DRIVE_TYPE=?, FEATURES=?
             WHERE VIN=?"
        );
        if ($stmt === false) { http_response_code(500); echo json_encode(['status'=>'error','message'=>$conn->error]); exit(); }
        $stmt->bind_param("ssssssssdisssssss",
            $brand, $make, $model_year, $year_of_manu, $plate,
            $type, $condition, $category, $daily_rate,
            $seats, $transmission, $fuel_type, $engine_size, $mileage_range, $drive_type, $features,
            $vin
        );
    }

    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to update vehicle: ' . $stmt->error]);
        exit();
    }
    $stmt->close();

    echo json_encode(['status' => 'success', 'message' => 'Vehicle updated.']);
    $conn->close(); exit();
}

// ── DELETE VEHICLE ──────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'delete') {

    $raw        = file_get_contents('php://input');
    $jsonInput  = json_decode($raw, true) ?? [];
    $vin        = trim($jsonInput['vehicle_id'] ?? $_POST['vehicle_id'] ?? '');

    if (!$vin) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'vehicle_id is required.']);
        $conn->close(); exit();
    }

    // Safety check — do not delete if vehicle is currently On Rental
    $check = $conn->prepare("SELECT VEHICLE_STATUS FROM vehicle WHERE VIN = ? LIMIT 1");
    $check->bind_param("s", $vin);
    $check->execute();
    $row = $check->get_result()->fetch_assoc();
    $check->close();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => 'Vehicle not found.']);
        $conn->close(); exit();
    }

    if ($row['VEHICLE_STATUS'] === 'On Rental') {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'Cannot delete a vehicle that is currently On Rental.']);
        $conn->close(); exit();
    }

    // Wrap in a transaction so either everything deletes or nothing does
    $conn->begin_transaction();
    try {
        // Delete child rows that reference this VIN (adjust table names if yours differ)
        foreach ([
            "DELETE FROM rental         WHERE VIN = ?",
            "DELETE FROM booking        WHERE VIN = ?",
            "DELETE FROM rental_history WHERE VIN = ?",
        ] as $sql) {
            $s = $conn->prepare($sql);
            if ($s) { $s->bind_param("s", $vin); $s->execute(); $s->close(); }
        }

        // Now delete the vehicle itself
        $del = $conn->prepare("DELETE FROM vehicle WHERE VIN = ?");
        $del->bind_param("s", $vin);
        if (!$del->execute()) {
            throw new Exception("Delete failed: " . $del->error);
        }
        $del->close();

        $conn->commit();
        echo json_encode(["status" => "success", "message" => "Vehicle deleted successfully."]);
    } catch (Exception $e) {
        $conn->rollback();
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => $e->getMessage()]);
    }
    $conn->close(); exit();
}


// ── Fallback ────────────────────────────────────────────────
http_response_code(400);
echo json_encode(['status' => 'error', 'message' => 'Unknown action or method.']);
$conn->close();
?>