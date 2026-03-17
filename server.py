import http.server
import socketserver
import os

# Устанавливаем порт
PORT = 80
# Определяем рабочую директорию (папка, где лежит этот скрипт)
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Указываем серверу работать в папке скрипта
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Отключаем кеширование для браузера
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"=== UI Server 2026 Ready ===")
        print(f"Root: {DIRECTORY}")
        print(f"URL: http://127.0.0.1:{PORT}")
        httpd.serve_forever()
