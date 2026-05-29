<?php
declare(strict_types=1);

class Router {
    private array $routes = [];

    public function get(string $path, $handler, bool $auth = false): void {
        $this->routes[] = ['GET', $path, $handler, $auth];
    }

    public function post(string $path, $handler, bool $auth = false): void {
        $this->routes[] = ['POST', $path, $handler, $auth];
    }

    public function put(string $path, $handler, bool $auth = false): void {
        $this->routes[] = ['PUT', $path, $handler, $auth];
    }

    public function delete(string $path, $handler, bool $auth = false): void {
        $this->routes[] = ['DELETE', $path, $handler, $auth];
    }

    public function dispatch(): void {
        $method = $_SERVER['REQUEST_METHOD'];
        $uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

        foreach ($this->routes as [$routeMethod, $routePath, $handler, $auth]) {
            if ($method !== $routeMethod) continue;

            $pattern = preg_replace('/\{[^}]+\}/', '([^/]+)', $routePath);
            $pattern = '#^' . $pattern . '$#';

            if (!preg_match($pattern, $uri, $matches)) continue;

            array_shift($matches);

            if ($auth) {
                $user = Auth::requireAuth();
            } else {
                $user = Auth::getUser();
            }

            if (is_callable($handler)) {
                call_user_func_array($handler, $matches);
                return;
            }

            [$class, $method2] = explode('@', $handler);
            $file = __DIR__ . '/controllers/' . $class . '.php';
            if (!file_exists($file)) {
                http_response_code(500);
                echo json_encode(['message' => "Controller {$class} not found"]);
                return;
            }
            require_once $file;
            $controller = new $class();
            if (isset($user)) $controller->user = $user;
            call_user_func_array([$controller, $method2], $matches);
            return;
        }

        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
    }
}
