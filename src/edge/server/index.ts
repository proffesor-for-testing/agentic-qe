/**
 * Edge Server Entry Point
 *
 * Combined server providing:
 * - WebSocket signaling for WebRTC P2P connections
 * - REST API for agent spawning and management
 *
 * @module edge/server
 * @version 1.0.0
 */

import express, { Request, Response, NextFunction, Application } from 'express';
import cors from 'cors';
import { SignalingServer, SignalingServerConfig } from './SignalingServer';
import { AgentSpawnService, SpawnAgentRequest, AgentStatus } from './AgentSpawnAPI';

// ============================================
// Types
// ============================================

export interface EdgeServerConfig {
  httpPort: number;
  wsPort: number;
  host?: string;
  corsOrigins?: string[];
  projectPath?: string;
  maxAgents?: number;
  signalingConfig?: Partial<SignalingServerConfig>;
}

export interface EdgeServerStats {
  http: {
    uptime: number;
  };
  signaling: {
    totalPeers: number;
    totalRooms: number;
    messagesProcessed: number;
    uptime: number;
  };
  agents: {
    running: number;
    completed: number;
    total: number;
  };
}

// ============================================
// Edge Server
// ============================================

export class EdgeServer {
  private app: express.Application;
  private httpServer: ReturnType<express.Application['listen']> | null = null;
  private signalingServer: SignalingServer;
  private agentService: AgentSpawnService;
  private config: EdgeServerConfig;
  private startTime: number = 0;

  constructor(config: EdgeServerConfig) {
    this.config = {
      host: '0.0.0.0',
      corsOrigins: ['http://localhost:3000', 'http://localhost:3001'],
      maxAgents: 10,
      ...config,
    };

    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();

    // Initialize Signaling Server
    this.signalingServer = new SignalingServer({
      port: this.config.wsPort,
      host: this.config.host,
      ...this.config.signalingConfig,
    });

    // Initialize Agent Service
    this.agentService = new AgentSpawnService({
      maxAgents: this.config.maxAgents,
      projectPath: this.config.projectPath,
    });

    this.setupAgentEvents();
  }

  // ============================================
  // Middleware Setup
  // ============================================

  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // JSON body parser
    this.app.use(express.json());

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[EdgeServer] ${req.method} ${req.path}`);
      next();
    });
  }

  // ============================================
  // Route Setup
  // ============================================

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
        version: '1.0.0',
      });
    });

    // Server stats
    this.app.get('/stats', (_req: Request, res: Response) => {
      const stats = this.getStats();
      res.json(stats);
    });

    // ==========================================
    // Agent API Routes
    // ==========================================

    // API Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
        version: '1.0.0',
        agents: this.agentService.list().length,
        signalingPeers: this.signalingServer.getStats().totalPeers,
      });
    });

    // List available agent types
    this.app.get('/api/agents/types', (_req: Request, res: Response) => {
      const types = this.agentService.getAvailableTypes();
      res.json({ types });
    });

    // Spawn a new agent
    this.app.post('/api/agents/spawn', async (req: Request, res: Response) => {
      const request = req.body as SpawnAgentRequest;

      if (!request.agentType || !request.task) {
        res.status(400).json({
          success: false,
          error: 'agentType and task are required',
        });
        return;
      }

      const result = await this.agentService.spawn(request);

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    });

    // List all agents
    this.app.get('/api/agents', (req: Request, res: Response) => {
      const status = req.query.status as string | undefined;
      const agentType = req.query.type as string | undefined;

      const agents = this.agentService.list({
        status: status as AgentStatus['status'],
        agentType,
      });

      res.json({ agents });
    });

    // Get agent status
    this.app.get('/api/agents/:id', (req: Request, res: Response) => {
      const status = this.agentService.getStatus(req.params.id);

      if (status) {
        res.json(status);
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }
    });

    // Get agent output
    this.app.get('/api/agents/:id/output', (req: Request, res: Response) => {
      const lastN = req.query.last ? parseInt(req.query.last as string, 10) : undefined;
      const output = this.agentService.getOutput(req.params.id, lastN);

      if (output) {
        res.json({ output });
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }
    });

    // Cancel agent
    this.app.delete('/api/agents/:id', (req: Request, res: Response) => {
      const cancelled = this.agentService.cancel(req.params.id);

      if (cancelled) {
        res.json({ success: true, message: 'Agent cancelled' });
      } else {
        res.status(400).json({
          success: false,
          error: 'Cannot cancel agent (not running or not found)',
        });
      }
    });

    // ==========================================
    // Signaling Info Routes
    // ==========================================

    // Get signaling server stats
    this.app.get('/api/signaling/stats', (_req: Request, res: Response) => {
      const stats = this.signalingServer.getStats();
      res.json(stats);
    });

    // Get room peers
    this.app.get('/api/signaling/rooms/:roomId/peers', (req: Request, res: Response) => {
      const peers = this.signalingServer.getRoomPeers(req.params.roomId);
      res.json({ roomId: req.params.roomId, peers });
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('[EdgeServer] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  // ============================================
  // Agent Event Handlers
  // ============================================

  private setupAgentEvents(): void {
    this.agentService.on('agent:created', ({ agentId, agentType }) => {
      console.log(`[EdgeServer] Agent created: ${agentId} (${agentType})`);
    });

    this.agentService.on('agent:started', ({ agentId }) => {
      console.log(`[EdgeServer] Agent started: ${agentId}`);
    });

    this.agentService.on('agent:completed', ({ agentId, exitCode }) => {
      console.log(`[EdgeServer] Agent completed: ${agentId} (exit: ${exitCode})`);
    });

    this.agentService.on('agent:error', ({ agentId, error }) => {
      console.error(`[EdgeServer] Agent error: ${agentId} - ${error}`);
    });

    this.agentService.on('agent:cancelled', ({ agentId }) => {
      console.log(`[EdgeServer] Agent cancelled: ${agentId}`);
    });
  }

  // ============================================
  // Server Lifecycle
  // ============================================

  /**
   * Start the edge server
   */
  public async start(): Promise<void> {
    // Start signaling server
    await this.signalingServer.start();

    // Start HTTP server
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(
          this.config.httpPort,
          this.config.host!,
          () => {
            this.startTime = Date.now();
            console.log(
              `[EdgeServer] HTTP API listening on ${this.config.host}:${this.config.httpPort}`
            );
            console.log(
              `[EdgeServer] WebSocket signaling on ${this.config.host}:${this.config.wsPort}`
            );
            resolve();
          }
        );

        this.httpServer.on('error', (error) => {
          console.error('[EdgeServer] HTTP server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the edge server
   */
  public async stop(): Promise<void> {
    // Stop signaling server
    await this.signalingServer.stop();

    // Stop HTTP server
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer!.close(() => {
          console.log('[EdgeServer] HTTP server stopped');
          resolve();
        });
      });
    }
  }

  /**
   * Get combined server stats
   */
  public getStats(): EdgeServerStats {
    const signalingStats = this.signalingServer.getStats();
    const agents = this.agentService.list();

    return {
      http: {
        uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      },
      signaling: signalingStats,
      agents: {
        running: agents.filter((a) => a.status === 'running').length,
        completed: agents.filter((a) => a.status === 'completed').length,
        total: agents.length,
      },
    };
  }
}

// ============================================
// CLI Entry Point
// ============================================

async function main() {
  const httpPort = parseInt(process.env.HTTP_PORT || '3001', 10);
  const wsPort = parseInt(process.env.WS_PORT || '3002', 10);
  const host = process.env.HOST || '0.0.0.0';

  const server = new EdgeServer({
    httpPort,
    wsPort,
    host,
    projectPath: process.cwd(),
    corsOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
    ],
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n[EdgeServer] Shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[EdgeServer] Terminating...');
    await server.stop();
    process.exit(0);
  });

  try {
    await server.start();
    console.log('[EdgeServer] Ready for connections');
  } catch (error) {
    console.error('[EdgeServer] Failed to start:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { SignalingServer, AgentSpawnService };
export default EdgeServer;
