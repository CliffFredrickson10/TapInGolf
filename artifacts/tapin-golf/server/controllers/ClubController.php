<?php
declare(strict_types=1);

class ClubController {
    public ?array $user = null;

    public function index(): void {
        $q        = trim($_GET['q'] ?? '');
        $province = trim($_GET['province'] ?? '');
        $featured = isset($_GET['featured']) ? (int)$_GET['featured'] : 0;
        $limit    = min((int)($_GET['limit'] ?? 20), 50);

        $where  = [];
        $params = [];

        if ($q) {
            $where[]  = '(c.name LIKE ? OR c.location LIKE ?)';
            $params[] = "%{$q}%";
            $params[] = "%{$q}%";
        }
        if ($province && $province !== 'All') {
            $where[]  = 'c.province = ?';
            $params[] = $province;
        }
        if ($featured) {
            $where[] = 'c.featured = 1';
        }

        $sql = 'SELECT c.*, 
                    ROUND(AVG(r.rating), 1) as rating,
                    COUNT(DISTINCT r.id) as review_count
                FROM clubs c
                LEFT JOIN reviews r ON r.club_id = c.id
                WHERE c.active = 1'
            . ($where ? ' AND ' . implode(' AND ', $where) : '')
            . ' GROUP BY c.id ORDER BY c.featured DESC, c.name ASC LIMIT ' . $limit;

        $clubs = DB::query($sql, $params);

        foreach ($clubs as &$club) {
            $club['facilities'] = $club['facilities'] ? json_decode($club['facilities'], true) : [];
            $club['rating'] = $club['rating'] ? (float)$club['rating'] : null;
            $club['review_count'] = (int)$club['review_count'];
            $club['price_from'] = $club['price_from'] ? (float)$club['price_from'] : null;
        }

        $featured_clubs = array_filter($clubs, fn($c) => $c['featured']);
        $nearby_clubs   = array_values(array_filter($clubs, fn($c) => !$c['featured']));

        echo json_encode([
            'clubs'  => array_values($featured_clubs),
            'nearby' => $nearby_clubs,
        ]);
    }

    public function show(string $id): void {
        $club = DB::row(
            'SELECT c.*,
                ROUND(AVG(r.rating), 1) as rating,
                COUNT(DISTINCT r.id) as review_count
             FROM clubs c
             LEFT JOIN reviews r ON r.club_id = c.id
             WHERE c.id = ? AND c.active = 1
             GROUP BY c.id',
            [(int)$id]
        );

        if (!$club) {
            http_response_code(404);
            echo json_encode(['message' => 'Club not found']);
            return;
        }

        $club['facilities'] = $club['facilities'] ? json_decode($club['facilities'], true) : [];
        $club['rating'] = $club['rating'] ? (float)$club['rating'] : null;
        $club['review_count'] = (int)$club['review_count'];
        $club['price_from'] = $club['price_from'] ? (float)$club['price_from'] : null;

        echo json_encode(['club' => $club]);
    }
}
