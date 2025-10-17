import http.server
import socketserver
import signal
import sys

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Aggressive no-cache headers for all files
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Last-Modified', '0')
        self.send_header('ETag', '')  # Remove ETags
        super().end_headers()
    
    def do_GET(self):
        # Add extra cache-busting for JS, CSS, HTML, and JSON files
        if any(self.path.endswith(ext) for ext in ['.js', '.css', '.html', '.json']):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache') 
            self.send_header('Expires', '0')
            self.send_header('Last-Modified', '0')
            self.send_header('ETag', '')
        
        super().do_GET()

def signal_handler(sig, frame):
    print('\nShutting down server...')
    sys.exit(0)

PORT = 8000
Handler = NoCacheHTTPRequestHandler

# Set up signal handler for Ctrl+C
signal.signal(signal.SIGINT, signal_handler)

print(f"Starting server at http://localhost:{PORT}")
print("This server includes no-cache headers to prevent browser caching")
print("Press Ctrl+C to stop the server")

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("Server is running. Press Ctrl+C to stop.")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped by user.")
except Exception as e:
    print(f"\nServer error: {e}")
finally:
    print("Server shutdown complete.")