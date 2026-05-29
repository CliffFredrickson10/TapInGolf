<?php
declare(strict_types=1);

class Auth {
    public static function generateToken(int $userId): string {
        $payload = base64_encode(json_encode([
            'sub' => $userId,
            'iat' => time(),
            'exp' => time() + (86400 * 30),
        ]));
        $secret = getenv('SESSION_SECRET') ?: 'tapingolf_secret_2026';
        $sig = hash_hmac('sha256', $payload, $secret);
        return $payload . '.' . $sig;
    }

    public static function verifyToken(string $token): ?int {
        $parts = explode('.', $token);
        if (count($parts) !== 2) return null;
        [$payload, $sig] = $parts;
        $secret = getenv('SESSION_SECRET') ?: 'tapingolf_secret_2026';
        $expected = hash_hmac('sha256', $payload, $secret);
        if (!hash_equals($expected, $sig)) return null;
        $data = json_decode(base64_decode($payload), true);
        if (!$data || $data['exp'] < time()) return null;
        return (int) $data['sub'];
    }

    public static function getUser(): ?array {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!str_starts_with($header, 'Bearer ')) return null;
        $token = substr($header, 7);
        $userId = self::verifyToken($token);
        if (!$userId) return null;
        return DB::row('SELECT id, name, email, phone, handicap, role FROM users WHERE id = ?', [$userId]);
    }

    public static function requireAuth(): array {
        $user = self::getUser();
        if (!$user) {
            http_response_code(401);
            echo json_encode(['message' => 'Unauthorized']);
            exit;
        }
        return $user;
    }
}
