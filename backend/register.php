<?php

require_once 'db_connection.php';

error_reporting(0);
ini_set('display_errors', 0);

header('Content-Type: application/json');

require_once 'db_connection.php';

// --- Request Method Validation ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.']);
    exit();
}

// --- Server-Side Input Validation ---
$errors = [];
$data   = [];
$fields = [
    'email'          => 'Email',
    'password'       => 'Password',
    'confirmPassword'=> 'Confirm Password',
    'firstName'      => 'First Name',
    'lastName'       => 'Last Name',
    'idNumber'       => 'ID Number',
    'phone'          => 'Phone Number',
    'address'        => 'Physical Address',
    'kinFirstName'   => 'Emergency Contact First Name',
    'kinLastName'    => 'Emergency Contact Last Name',
    'kinPhone'       => 'Emergency Contact Phone',
    'kinAddress'     => 'Emergency Contact Address',
    'workPhone'      => 'Work Phone',
    'city'           => 'City',
    'country'        => 'Country',
];

// 1. Check for presence and trim
foreach ($fields as $key => $name) {
    if (empty(trim($_POST[$key] ?? ''))) {
        $errors[] = "$name is required.";
    } else {
        $data[$key] = trim($_POST[$key]);
    }
}

// 2. Specific validation rules
if (isset($data['email']) && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    $errors[] = 'Invalid email address format.';
}
if (isset($data['password']) && strlen($data['password']) < 8) {
    $errors[] = 'Password must be at least 8 characters long.';
}
if (isset($data['password'], $data['confirmPassword']) && $data['password'] !== $data['confirmPassword']) {
    $errors[] = 'Passwords do not match.';
}
if (isset($data['idNumber']) && !ctype_digit($data['idNumber'])) {
    $errors[] = 'ID Number must contain only digits.';
}
if (isset($data['phone']) && !preg_match('/^\+?\d{8,15}$/', $data['phone'])) {
    $errors[] = 'Invalid phone number format.';
}

// 3. File upload validation
if (empty($_FILES['licenseFront']['name'])) {
    $errors[] = 'Front of license is required.';
}
if (empty($_FILES['licenseBack']['name'])) {
    $errors[] = 'Back of license is required.';
}

if (!empty($errors)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Validation failed.', 'errors' => $errors]);
    exit();
}

// --- Image Upload Handling Function ---
function handle_upload($file_key, $customer_national_id) {
    if (isset($_FILES[$file_key]) && $_FILES[$file_key]['error'] === UPLOAD_ERR_OK) {
        $upload_dir = __DIR__ . '/uploads/';
        if (!is_dir($upload_dir) && !mkdir($upload_dir, 0777, true)) {
            throw new Exception('Failed to create uploads directory. Please check permissions.');
        }

        $file_info       = pathinfo($_FILES[$file_key]['name']);
        $file_extension  = strtolower($file_info['extension']);
        $safe_extensions = ['jpg', 'jpeg', 'png', 'gif'];

        if (!in_array($file_extension, $safe_extensions)) {
            throw new Exception("Invalid file type for $file_key. Only JPG, JPEG, PNG, GIF are allowed.");
        }

        $unique_name = $file_key . '_' . $customer_national_id . '_' . uniqid() . '.' . $file_extension;
        $destination = $upload_dir . $unique_name;

        if (!move_uploaded_file($_FILES[$file_key]['tmp_name'], $destination)) {
            throw new Exception("Failed to move uploaded file for $file_key. Check directory permissions.");
        }

        $protocol    = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https://" : "http://";
        $host        = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $script_path = str_replace(basename(__FILE__), '', $_SERVER['SCRIPT_NAME']);
        return $protocol . $host . $script_path . 'uploads/' . $unique_name;
    }
    throw new Exception("File upload failed for $file_key. Error code: " . ($_FILES[$file_key]['error'] ?? 'UNKNOWN'));
}

// --- Database Operations ---
$conn->begin_transaction();

try {
    // 1. Check if National ID already exists
    // DB column: Cust_National_ID (PK on customer table)
    $stmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Cust_National_ID = ?");
    if ($stmt === false) throw new Exception('Database error: Failed to prepare ID check.');
    $stmt->bind_param("s", $data['idNumber']);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        throw new Exception('An account with this National ID already exists.', 409);
    }
    $stmt->close();

    // 2. Check if email already exists
    // DB column: Email (UNIQUE on customer table)
    $stmt = $conn->prepare("SELECT Cust_National_ID FROM customer WHERE Email = ?");
    if ($stmt === false) throw new Exception('Database error: Failed to prepare email check.');
    $stmt->bind_param("s", $data['email']);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        throw new Exception('An account with this email address already exists.', 409);
    }
    $stmt->close();

    // 3. Insert into customer table
    // DB columns: Cust_National_ID, Email, Password_Hash, First_Name, Last_Name,
    //             Phys_Address, Phone, Work_Phone, City, Country, Created_At, Updated_At
    $sql_customer = "INSERT INTO customer 
        (Cust_National_ID, Email, Password_Hash, First_Name, Last_Name, Phys_Address, Phone, Work_Phone, City, Country, Created_At, Updated_At) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";

    $password_hash = password_hash($data['password'], PASSWORD_DEFAULT);

    $stmt = $conn->prepare($sql_customer);
    if ($stmt === false) throw new Exception('Database error: Failed to prepare customer insertion.');
    $stmt->bind_param("ssssssssss",
        $data['idNumber'],
        $data['email'],
        $password_hash,
        $data['firstName'],
        $data['lastName'],
        $data['address'],
        $data['phone'],
        $data['workPhone'],
        $data['city'],
        $data['country']
    );
    if (!$stmt->execute()) {
        throw new Exception('Failed to execute customer insertion. Error: ' . $stmt->error);
    }
    $stmt->close();

    // Use the National ID as the customer identifier going forward
    $customer_national_id = $data['idNumber'];

    // 4. Insert into next_of_kin table
    // DB columns: First_Name, Last_Name, Phone, Phys_Address, Cust_National_ID
    // PK is composite: (Cust_National_ID, Phone)
    $sql_kin = "INSERT INTO next_of_kin (First_Name, Last_Name, Phone, Phys_Address, Cust_National_ID) VALUES (?, ?, ?, ?, ?)";
    $stmt = $conn->prepare($sql_kin);
    if ($stmt === false) throw new Exception('Database error: Failed to prepare kin insertion.');
    $stmt->bind_param("sssss",
        $data['kinFirstName'],
        $data['kinLastName'],
        $data['kinPhone'],
        $data['kinAddress'],
        $customer_national_id
    );
    if (!$stmt->execute()) throw new Exception('Failed to execute kin insertion. Error: ' . $stmt->error);
    $stmt->close();

    // 5. Handle license uploads and insert into license table
    // DB columns: License_No (PK), Cust_National_ID (FK → customer.Cust_National_ID),
    //             Front_Img_URL, Back_Img_URL
    $license_front_url = handle_upload('licenseFront', $customer_national_id);
    $license_back_url  = handle_upload('licenseBack',  $customer_national_id);

    $sql_license = "INSERT INTO license (License_No, Cust_National_ID, Front_Img_URL, Back_Img_URL) VALUES (?, ?, ?, ?)";
    $stmt = $conn->prepare($sql_license);
    if ($stmt === false) throw new Exception('Database error: Failed to prepare license insertion.');
    $stmt->bind_param("ssss",
        $customer_national_id,
        $customer_national_id,
        $license_front_url,
        $license_back_url
    );
    if (!$stmt->execute()) throw new Exception('Failed to execute license insertion. Error: ' . $stmt->error);
    $stmt->close();

    $conn->commit();

    http_response_code(201);
    echo json_encode([
        'status'      => 'success',
        'message'     => 'Registration successful!',
        'customer_id' => $customer_national_id
    ]);

} catch (Throwable $e) {
    $conn->rollback();
    $code = is_int($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600 ? $e->getCode() : 500;
    http_response_code($code);
    echo json_encode([
        'status'  => 'error',
        'message' => $e->getMessage()
    ]);
} finally {
    if (isset($conn) && $conn instanceof mysqli) {
        $conn->close();
    }
}
?>