import { vi } from 'vitest';

export class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readyState: number = WebSocket.CONNECTING;

  public url: string;
  private messageQueue: any[] = [];

  constructor(url: string) {
    this.url = url;

    // Simulate async connection
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }

      // Process queued messages
      this.messageQueue.forEach(msg => this.simulateMessage(msg));
      this.messageQueue = [];
    }, 10);
  }

  send(data: string) {
    // Mock send - do nothing
  }

  close(code?: number, reason?: string) {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }

  // Helper methods for testing
  simulateMessage(data: any) {
    if (this.readyState === WebSocket.OPEN && this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    } else {
      this.messageQueue.push(data);
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose() {
    this.close(1000, 'Normal closure');
  }
}

export function setupWebSocketMock() {
  global.WebSocket = MockWebSocket as any;
  return MockWebSocket;
}
