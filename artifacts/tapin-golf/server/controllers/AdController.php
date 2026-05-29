<?php
declare(strict_types=1);

class AdController {
    public ?array $user = null;

    public function index(): void {
        $placement = $_GET['placement'] ?? 'home';
        $clubId    = isset($_GET['club_id']) ? (int)$_GET['club_id'] : null;

        $where  = ['a.active = 1', 'a.placement = ?'];
        $params = [$placement];

        if ($clubId) {
            $where[] = '(a.club_id IS NULL OR a.club_id = ?)';
            $params[] = $clubId;
        }

        $ads = DB::query(
            'SELECT a.*, u.name as advertiser_name
             FROM ads a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY a.priority DESC, RAND()
             LIMIT 3',
            $params
        );

        echo json_encode(['ads' => $ads]);
    }
}
