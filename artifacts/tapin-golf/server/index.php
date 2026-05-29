<?php
declare(strict_types=1);

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/router.php';

$router = new Router();

// Auth routes
$router->post('/api/auth/login', 'AuthController@login');
$router->post('/api/auth/register', 'AuthController@register');

// Profile
$router->put('/api/profile', 'ProfileController@update', true);

// Clubs
$router->get('/api/clubs', 'ClubController@index');
$router->get('/api/clubs/{id}', 'ClubController@show');
$router->get('/api/clubs/{id}/tee-times', 'TeeTimeController@index');

// Bookings
$router->get('/api/bookings', 'BookingController@index', true);
$router->post('/api/bookings', 'BookingController@create', true);
$router->get('/api/bookings/{id}', 'BookingController@show', true);
$router->put('/api/bookings/{id}/cancel', 'BookingController@cancel', true);

// Friends
$router->get('/api/friends', 'FriendController@index', true);
$router->post('/api/friends/request', 'FriendController@request', true);
$router->put('/api/friends/{id}/accept', 'FriendController@accept', true);
$router->delete('/api/friends/{id}', 'FriendController@remove', true);

// Ads
$router->get('/api/ads', 'AdController@index');

// Health
$router->get('/api/healthz', function() {
    echo json_encode(['status' => 'ok']);
});

$router->dispatch();
