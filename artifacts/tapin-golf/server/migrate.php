<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

$pdo = DB::get();

$migrations = [
    'users' => "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            handicap DECIMAL(4,1),
            role ENUM('golfer','club_admin','advertiser') NOT NULL DEFAULT 'golfer',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'clubs' => "
        CREATE TABLE IF NOT EXISTS clubs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            location VARCHAR(255) NOT NULL,
            province VARCHAR(100) NOT NULL,
            image_url VARCHAR(500),
            holes INT DEFAULT 18,
            price_from DECIMAL(10,2),
            facilities JSON,
            featured TINYINT(1) DEFAULT 0,
            active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'tee_times' => "
        CREATE TABLE IF NOT EXISTS tee_times (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            date DATE NOT NULL,
            time TIME NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            total_slots INT NOT NULL DEFAULT 4,
            active TINYINT(1) DEFAULT 1,
            FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'bookings' => "
        CREATE TABLE IF NOT EXISTS bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            tee_time_id INT NOT NULL,
            players INT NOT NULL DEFAULT 1,
            split_bill TINYINT(1) DEFAULT 0,
            total_amount DECIMAL(10,2) NOT NULL,
            my_amount DECIMAL(10,2) NOT NULL,
            booking_ref VARCHAR(20) UNIQUE NOT NULL,
            payment_method VARCHAR(50) DEFAULT 'payfast',
            status ENUM('pending','confirmed','cancelled','completed') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (tee_time_id) REFERENCES tee_times(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'booking_players' => "
        CREATE TABLE IF NOT EXISTS booking_players (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_id INT NOT NULL,
            user_id INT NOT NULL,
            paid TINYINT(1) DEFAULT 0,
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'friendships' => "
        CREATE TABLE IF NOT EXISTS friendships (
            id INT AUTO_INCREMENT PRIMARY KEY,
            requester_id INT NOT NULL,
            addressee_id INT NOT NULL,
            status ENUM('pending','accepted','declined') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friendship (requester_id, addressee_id),
            FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'reviews' => "
        CREATE TABLE IF NOT EXISTS reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            club_id INT NOT NULL,
            user_id INT NOT NULL,
            rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
    'ads' => "
        CREATE TABLE IF NOT EXISTS ads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            club_id INT,
            title VARCHAR(255) NOT NULL,
            subtitle TEXT,
            image_url VARCHAR(500),
            cta_text VARCHAR(100),
            link_url VARCHAR(500),
            placement ENUM('home','club','explore') DEFAULT 'home',
            priority INT DEFAULT 0,
            active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (club_id) REFERENCES clubs(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ",
];

$seeded = false;

foreach ($migrations as $table => $sql) {
    try {
        $pdo->exec($sql);
        echo "✓ Table: {$table}\n";
    } catch (PDOException $e) {
        echo "✗ {$table}: " . $e->getMessage() . "\n";
    }
}

// Seed sample clubs if empty
$count = (int) $pdo->query('SELECT COUNT(*) FROM clubs')->fetchColumn();
if ($count === 0) {
    $clubs = [
        ['Glendower Golf Club', 'Edenvale', 'Gauteng', 18, 650.00, 1, '["Driving Range","Pro Shop","Restaurant","Caddy Service"]'],
        ['Randpark Golf Club', 'Randburg', 'Gauteng', 36, 580.00, 1, '["Two 18-hole courses","Pro Shop","Restaurant","Lessons"]'],
        ['Westlake Golf Club', 'Tokai', 'Western Cape', 18, 720.00, 1, '["Mountain Views","Pro Shop","Club Hire","Bar"]'],
        ['Royal Cape Golf Club', 'Wynberg', 'Western Cape', 18, 850.00, 1, '["Historic Club","Pro Shop","Restaurant","Caddy Service"]'],
        ['Durban Country Club', 'Durban', 'KZN', 18, 900.00, 1, '["Beach Course","Pro Shop","Restaurant","Pool"]'],
        ['Leopard Creek', 'Malelane', 'Mpumalanga', 18, 2500.00, 1, '["Big 5 Views","Luxury Lodge","Caddy Required","Pro Shop"]'],
        ['Fancourt Hotel & CC', 'George', 'Western Cape', 54, 1800.00, 1, '["3 Courses","Links Course","Academy","Spa","Luxury Hotel"]'],
        ['Sun City Gary Player CC', 'Sun City', 'North West', 18, 1200.00, 1, '["Resort","Pro Shop","Casino","Hotel","Pool"]'],
    ];

    $stmt = $pdo->prepare(
        'INSERT INTO clubs (name, location, province, holes, price_from, featured, facilities) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    foreach ($clubs as $c) {
        $stmt->execute($c);
        echo "  Seeded club: {$c[0]}\n";
    }

    // Seed tee times for each club for the next 14 days
    $clubIds = $pdo->query('SELECT id FROM clubs')->fetchAll(PDO::FETCH_COLUMN);
    $times = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00'];
    $stmt2 = $pdo->prepare('INSERT INTO tee_times (club_id, date, time, price, total_slots) VALUES (?, ?, ?, ?, 4)');

    for ($d = 0; $d < 14; $d++) {
        $date = date('Y-m-d', strtotime("+{$d} days"));
        foreach ($clubIds as $cid) {
            $club = $pdo->query("SELECT price_from FROM clubs WHERE id = {$cid}")->fetch();
            $base = (float)($club['price_from'] ?? 500);
            foreach ($times as $time) {
                $stmt2->execute([$cid, $date, $time, $base]);
            }
        }
    }
    echo "✓ Seeded tee times for 14 days\n";
    $seeded = true;
}

echo $seeded ? "\n✓ Database seeded\n" : "\n✓ Database already has data\n";
echo "Migration complete.\n";
