<?php
declare(strict_types=1);

class TeeTimeController {
    public ?array $user = null;

    public function index(string $clubId): void {
        $date = $_GET['date'] ?? date('Y-m-d');

        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            http_response_code(400);
            echo json_encode(['message' => 'Invalid date format']);
            return;
        }

        $slots = DB::query(
            'SELECT t.*,
                (t.total_slots - COALESCE(
                    (SELECT SUM(b.players) FROM bookings b
                     WHERE b.tee_time_id = t.id AND b.status IN (\'confirmed\',\'pending\')),
                0)) as available_slots
             FROM tee_times t
             WHERE t.club_id = ? AND t.date = ? AND t.active = 1
             ORDER BY t.time ASC',
            [(int)$clubId, $date]
        );

        foreach ($slots as &$slot) {
            $slot['available_slots'] = max(0, (int)$slot['available_slots']);
            $slot['total_slots'] = (int)$slot['total_slots'];
            $slot['price'] = (float)$slot['price'];
        }

        echo json_encode(['tee_times' => $slots]);
    }
}
