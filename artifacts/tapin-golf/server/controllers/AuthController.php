<?php
declare(strict_types=1);

class AuthController {
    public ?array $user = null;

    public function login(): void {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $email    = trim(strtolower($body['email'] ?? ''));
        $password = $body['password'] ?? '';

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['message' => 'Email and password are required']);
            return;
        }

        $user = DB::row('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['message' => 'Invalid email or password']);
            return;
        }

        $token = Auth::generateToken((int)$user['id']);
        echo json_encode([
            'user' => [
                'id'       => $user['id'],
                'name'     => $user['name'],
                'email'    => $user['email'],
                'phone'    => $user['phone'],
                'handicap' => $user['handicap'],
                'role'     => $user['role'],
                'token'    => $token,
            ],
        ]);
    }

    public function register(): void {
        $body  = json_decode(file_get_contents('php://input'), true) ?? [];
        $name  = trim($body['name'] ?? '');
        $email = trim(strtolower($body['email'] ?? ''));
        $pass  = $body['password'] ?? '';
        $phone = trim($body['phone'] ?? '');

        if (!$name || !$email || !$pass) {
            http_response_code(400);
            echo json_encode(['message' => 'Name, email and password are required']);
            return;
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['message' => 'Invalid email address']);
            return;
        }

        $existing = DB::row('SELECT id FROM users WHERE email = ?', [$email]);
        if ($existing) {
            http_response_code(409);
            echo json_encode(['message' => 'An account with this email already exists']);
            return;
        }

        $hash = password_hash($pass, PASSWORD_BCRYPT);
        $id = DB::exec(
            'INSERT INTO users (name, email, password_hash, phone, role) VALUES (?, ?, ?, ?, ?)',
            [$name, $email, $hash, $phone, 'golfer']
        );

        $token = Auth::generateToken($id);
        echo json_encode([
            'user' => [
                'id'    => $id,
                'name'  => $name,
                'email' => $email,
                'phone' => $phone,
                'role'  => 'golfer',
                'token' => $token,
            ],
        ]);
    }
}
