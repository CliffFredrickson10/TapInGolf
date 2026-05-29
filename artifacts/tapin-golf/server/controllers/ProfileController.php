<?php
declare(strict_types=1);

class ProfileController {
    public ?array $user = null;

    public function update(): void {
        $body     = json_decode(file_get_contents('php://input'), true) ?? [];
        $name     = trim($body['name'] ?? $this->user['name']);
        $phone    = trim($body['phone'] ?? $this->user['phone'] ?? '');
        $handicap = isset($body['handicap']) ? (float)$body['handicap'] : null;

        DB::run(
            'UPDATE users SET name = ?, phone = ?, handicap = ? WHERE id = ?',
            [$name, $phone, $handicap, $this->user['id']]
        );

        echo json_encode(['success' => true, 'name' => $name, 'phone' => $phone, 'handicap' => $handicap]);
    }
}
