#!/usr/bin/env node
/**
 * Standalone test for WebSocket server (doesn't require full build)
 */

const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');

async function testWebSocketServer() {
  console.log('🧪 Testing WebSocket Server Implementation\n');

  // Create HTTP server
  const httpServer = http.createServer();

  // Create WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    perMessageDeflate: true
  });

  let clientConnected = false;

  // Setup WebSocket server handlers
  wss.on('connection', (ws, req) => {
    console.log('✅ Client connected to WebSocket server');
    clientConnected = true;

    ws.on('message', (data) => {
      console.log('📨 Server received:', data.toString());
    });

    ws.on('close', () => {
      console.log('✅ Client disconnected');
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      timestamp: new Date().toISOString(),
      data: { message: 'Connected to WebSocket server' }
    }));
  });

  wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error.message);
  });

  // Start HTTP server
  return new Promise((resolve, reject) => {
    httpServer.listen(8080, () => {
      console.log('✅ HTTP/WebSocket server started on port 8080\n');

      // Verify port binding
      const { exec } = require('child_process');
      exec('netstat -an | grep 8080 || ss -an | grep 8080 || lsof -i :8080', (error, stdout) => {
        if (stdout && stdout.includes('8080')) {
          console.log('✅ Port 8080 is bound and listening');
          console.log('   ' + stdout.trim().split('\n')[0]);
        }

        // Test client connection
        setTimeout(() => {
          console.log('\n🔌 Testing WebSocket client connection...');
          const client = new WebSocket('ws://localhost:8080');

          client.on('open', () => {
            console.log('✅ Client connected successfully');
            client.send(JSON.stringify({ type: 'ping' }));
          });

          client.on('message', (data) => {
            const message = JSON.parse(data.toString());
            console.log(`📨 Client received message type: ${message.type}`);
          });

          client.on('error', (error) => {
            console.log(`❌ Client error: ${error.message}`);
          });

          client.on('close', () => {
            console.log('✅ Client connection closed');

            // Cleanup
            setTimeout(() => {
              console.log('\n🛑 Stopping server...');
              wss.close(() => {
                httpServer.close(() => {
                  console.log('✅ Server stopped successfully');

                  if (clientConnected) {
                    console.log('\n✅ All tests passed!');
                    process.exit(0);
                  } else {
                    console.log('\n❌ Client did not connect');
                    process.exit(1);
                  }
                });
              });
            }, 500);
          });

          // Close client after a moment
          setTimeout(() => {
            client.close();
          }, 1000);
        }, 500);
      });
    });

    httpServer.on('error', (error) => {
      console.error('❌ HTTP server error:', error.message);
      reject(error);
    });
  });
}

// Run the test
testWebSocketServer().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
