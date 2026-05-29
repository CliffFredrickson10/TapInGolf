<?php
declare(strict_types=1);

class BookingController {
    public ?array $user = null;

    private function generateRef(): string {
        return 'TG' . strtoupper(substr(md5(uniqid()), 0, 8));
    }

    public function index(): void {
        $status = $_GET['status'] ?? 'upcoming';

        if ($status === 'upcoming') {
            $statusFilter = "b.status IN ('confirmed','pending') AND t.date >= CURDATE()";
        } else {
            $statusFilter = "b.status IN ('completed','cancelled') OR (b.status = 'confirmed' AND t.date < CURDATE())";
        }

        $bookings = DB::query(
            "SELECT b.*, c.name as club_name, c.location as club_location,
                    t.time, t.date, t.price
             FROM bookings b
             JOIN tee_times t ON t.id = b.tee_time_id
             JOIN clubs c ON c.id = t.club_id
             WHERE b.user_id = ? AND ({$statusFilter})
             ORDER BY t.date DESC, t.time DESC",
            [(int)$this->user['id']]
        );

        foreach ($bookings as &$b) {
            $b['total_amount'] = (float)$b['total_amount'];
            $b['my_amount']    = (float)$b['my_amount'];
            $b['players']      = (int)$b['players'];
        }

        echo json_encode(['bookings' => $bookings]);
    }

    public function show(string $id): void {
        $booking = DB::row(
            'SELECT b.*, c.name as club_name, c.location as club_location,
                    t.time, t.date, t.price
             FROM bookings b
             JOIN tee_times t ON t.id = b.tee_time_id
             JOIN clubs c ON c.id = t.club_id
             WHERE b.id = ? AND b.user_id = ?',
            [(int)$id, (int)$this->user['id']]
        );

        if (!$booking) {
            http_response_code(404);
            echo json_encode(['message' => 'Booking not found']);
            return;
        }

        $booking['total_amount'] = (float)$booking['total_amount'];
        $booking['my_amount']    = (float)$booking['my_amount'];
        $booking['players']      = (int)$booking['players'];

        // Get players list
        $players = DB::query(
            'SELECT u.name, u.email, bp.paid
             FROM booking_players bp
             JOIN users u ON u.id = bp.user_id
             WHERE bp.booking_id = ?',
            [(int)$id]
        );

        $booking['players_list'] = array_map(fn($p) => [
            'name'  => $p['name'],
            'email' => $p['email'],
            'paid'  => (bool)$p['paid'],
        ], $players);

        echo json_encode(['booking' => $booking]);
    }

    public function create(): void {
        $body          = json_decode(file_get_contents('php://input'), true) ?? [];
        $teeTimeId     = (int)($body['tee_time_id'] ?? 0);
        $players       = min(max((int)($body['players'] ?? 1), 1), 4);
        $splitBill     = (bool)($body['split_bill'] ?? false);
        $friendIds     = (array)($body['friend_ids'] ?? []);
        $paymentMethod = $body['payment_method'] ?? 'payfast';

        if (!$teeTimeId) {
            http_response_code(400);
            echo json_encode(['message' => 'Invalid tee time']);
            return;
        }

        $slot = DB::row(
            'SELECT t.*, c.name as club_name,
                (t.total_slots - COALESCE(
                    (SELECT SUM(b.players) FROM bookings b
                     WHERE b.tee_time_id = t.id AND b.status IN (\'confirmed\',\'pending\')),
                0)) as available
             FROM tee_times t
             JOIN clubs c ON c.id = t.club_id
             WHERE t.id = ? AND t.active = 1',
            [$teeTimeId]
        );

        if (!$slot) {
            http_response_code(404);
            echo json_encode(['message' => 'Tee time not found']);
            return;
        }

        if ($slot['available'] < $players) {
            http_response_code(409);
            echo json_encode(['message' => 'Not enough slots available']);
            return;
        }

        $totalAmount = (float)$slot['price'] * $players;
        $myAmount    = $splitBill && $players > 1 ? $totalAmount / $players : $totalAmount;
        $ref         = $this->generateRef();

        DB::get()->beginTransaction();
        try {
            $bookingId = DB::exec(
                'INSERT INTO bookings (user_id, tee_time_id, players, split_bill, total_amount, my_amount, booking_ref, payment_method, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [(int)$this->user['id'], $teeTimeId, $players, $splitBill ? 1 : 0,
                 $totalAmount, $myAmount, $ref, $paymentMethod, 'pending']
            );

            // Add main player
            DB::exec(
                'INSERT INTO booking_players (booking_id, user_id, paid) VALUES (?, ?, ?)',
                [$bookingId, (int)$this->user['id'], 0]
            );

            // Add friends
            foreach (array_slice($friendIds, 0, $players - 1) as $friendId) {
                DB::exec(
                    'INSERT INTO booking_players (booking_id, user_id, paid) VALUES (?, ?, ?)',
                    [$bookingId, (int)$friendId, 0]
                );
            }

            DB::get()->commit();
        } catch (Exception $e) {
            DB::get()->rollBack();
            http_response_code(500);
            echo json_encode(['message' => 'Booking failed: ' . $e->getMessage()]);
            return;
        }

        // PayFast payment URL
        $paymentUrl = null;
        if ($paymentMethod === 'payfast') {
            $paymentUrl = $this->buildPayFastUrl($bookingId, $myAmount, $slot['club_name'], $ref);
            // Mark confirmed for now (in prod, confirm via PayFast notify)
            DB::run('UPDATE bookings SET status = ? WHERE id = ?', ['confirmed', $bookingId]);
        } else {
            DB::run('UPDATE bookings SET status = ? WHERE id = ?', ['confirmed', $bookingId]);
        }

        echo json_encode([
            'booking_id'  => $bookingId,
            'booking_ref' => $ref,
            'payment_url' => $paymentUrl,
            'status'      => 'confirmed',
        ]);
    }

    public function cancel(string $id): void {
        $booking = DB::row(
            'SELECT b.* FROM bookings b
             JOIN tee_times t ON t.id = b.tee_time_id
             WHERE b.id = ? AND b.user_id = ? AND b.status = ?',
            [(int)$id, (int)$this->user['id'], 'confirmed']
        );

        if (!$booking) {
            http_response_code(404);
            echo json_encode(['message' => 'Booking not found or cannot be cancelled']);
            return;
        }

        DB::run('UPDATE bookings SET status = ? WHERE id = ?', ['cancelled', (int)$id]);
        echo json_encode(['success' => true]);
    }

    private function buildPayFastUrl(int $bookingId, float $amount, string $clubName, string $ref): string {
        $merchantId  = getenv('PAYFAST_MERCHANT_ID') ?: '';
        $merchantKey = getenv('PAYFAST_MERCHANT_KEY') ?: '';
        $passphrase  = getenv('PAYFAST_PASSPHRASE') ?: '';
        $pfUrl       = getenv('PAYFAST_URL') ?: 'https://sandbox.payfast.co.za/eng/process';

        $domain = $_SERVER['HTTP_HOST'] ?? '';
        $scheme = isset($_SERVER['HTTPS']) ? 'https' : 'http';

        $data = [
            'merchant_id'   => $merchantId,
            'merchant_key'  => $merchantKey,
            'return_url'    => "{$scheme}://{$domain}/booking/success",
            'cancel_url'    => "{$scheme}://{$domain}/booking/cancel",
            'notify_url'    => "{$scheme}://{$domain}/api/payfast/notify",
            'name_first'    => 'TapIn',
            'name_last'     => 'Golfer',
            'm_payment_id'  => (string)$bookingId,
            'amount'        => number_format($amount, 2, '.', ''),
            'item_name'     => "Golf Booking - {$clubName}",
            'item_description' => "Booking ref: {$ref}",
        ];

        if ($passphrase) {
            $data['passphrase'] = $passphrase;
        }

        ksort($data);
        $pfParamString = http_build_query($data);
        $data['signature'] = md5($pfParamString);

        return $pfUrl . '?' . http_build_query($data);
    }
}
