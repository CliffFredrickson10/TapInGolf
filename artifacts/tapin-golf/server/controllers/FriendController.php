<?php
declare(strict_types=1);

class FriendController {
    public ?array $user = null;

    public function index(): void {
        $friends = DB::query(
            "SELECT u.id, u.name, u.email, u.handicap,
                    CASE WHEN f.requester_id = ? THEN 'accepted' ELSE 'accepted' END as status
             FROM friendships f
             JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
             WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'",
            [(int)$this->user['id'], (int)$this->user['id'], (int)$this->user['id'], (int)$this->user['id']]
        );

        $pending = DB::query(
            "SELECT u.id, u.name, u.email, u.handicap, 'pending' as status
             FROM friendships f
             JOIN users u ON u.id = f.requester_id
             WHERE f.addressee_id = ? AND f.status = 'pending'",
            [(int)$this->user['id']]
        );

        foreach ($friends as &$f) { $f['handicap'] = $f['handicap'] ? (float)$f['handicap'] : null; }
        foreach ($pending as &$p) { $p['handicap'] = $p['handicap'] ? (float)$p['handicap'] : null; }

        echo json_encode(['friends' => $friends, 'pending' => $pending]);
    }

    public function request(): void {
        $body  = json_decode(file_get_contents('php://input'), true) ?? [];
        $email = trim(strtolower($body['email'] ?? ''));

        if (!$email) {
            http_response_code(400);
            echo json_encode(['message' => 'Email is required']);
            return;
        }

        if ($email === $this->user['email']) {
            http_response_code(400);
            echo json_encode(['message' => 'You cannot add yourself']);
            return;
        }

        $target = DB::row('SELECT id, name FROM users WHERE email = ?', [$email]);
        if (!$target) {
            http_response_code(404);
            echo json_encode(['message' => 'No golfer found with that email']);
            return;
        }

        $existing = DB::row(
            'SELECT id FROM friendships WHERE
             (requester_id = ? AND addressee_id = ?) OR
             (requester_id = ? AND addressee_id = ?)',
            [(int)$this->user['id'], (int)$target['id'], (int)$target['id'], (int)$this->user['id']]
        );

        if ($existing) {
            http_response_code(409);
            echo json_encode(['message' => 'Friend request already exists']);
            return;
        }

        DB::exec(
            'INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, ?)',
            [(int)$this->user['id'], (int)$target['id'], 'pending']
        );

        echo json_encode(['success' => true, 'message' => "Request sent to {$target['name']}"]);
    }

    public function accept(string $id): void {
        $rows = DB::run(
            "UPDATE friendships SET status = 'accepted'
             WHERE id = ? AND addressee_id = ? AND status = 'pending'",
            [(int)$id, (int)$this->user['id']]
        );

        if (!$rows) {
            http_response_code(404);
            echo json_encode(['message' => 'Friend request not found']);
            return;
        }

        echo json_encode(['success' => true]);
    }

    public function remove(string $id): void {
        DB::run(
            'DELETE FROM friendships WHERE
             (requester_id = ? AND addressee_id = ?) OR
             (requester_id = ? AND addressee_id = ?)',
            [(int)$this->user['id'], (int)$id, (int)$id, (int)$this->user['id']]
        );

        echo json_encode(['success' => true]);
    }
}
