<?php
declare(strict_types=1);

class DB {
    private static ?PDO $instance = null;

    public static function get(): PDO {
        if (self::$instance === null) {
            $host = getenv('MYSQL_HOST') ?: 'tapingolf.co.za';
            $port = getenv('MYSQL_PORT') ?: '3306';
            $db   = getenv('MYSQL_DATABASE') ?: 'tapingr7e9e4_tapingolf';
            $user = getenv('MYSQL_USER') ?: 'tapingr7e9e4_tapinadmin';
            $pass = getenv('MYSQL_PASSWORD') ?: '';

            $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";
            $opts = [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ];
            self::$instance = new PDO($dsn, $user, $pass, $opts);
        }
        return self::$instance;
    }

    public static function query(string $sql, array $params = []): array {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function row(string $sql, array $params = []): ?array {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function exec(string $sql, array $params = []): int {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return (int) self::get()->lastInsertId();
    }

    public static function run(string $sql, array $params = []): int {
        $stmt = self::get()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }
}
