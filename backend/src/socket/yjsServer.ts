import * as Y from 'yjs';
import { Server as WebSocketServer } from 'ws';
import { logger } from '../lib/logger';

// Store Yjs documents by job ID
const documents = new Map<string, Y.Doc>();

// Store WebSocket connections by job ID
const connections = new Map<string, Set<WebSocket>>();

export function initYjsServer(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: any) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const jobId = url.searchParams.get('jobId');
    const userId = url.searchParams.get('userId');

    if (!jobId || !userId) {
      ws.close(1008, 'Job ID and User ID are required');
      return;
    }

    logger.info({ jobId, userId }, 'Yjs WebSocket connection established');

    // Get or create document for this job
    let doc = documents.get(jobId);
    if (!doc) {
      doc = new Y.Doc();
      documents.set(jobId, doc);
      
      // Set up document structure
      const milestones = doc.getMap('milestones');
      const metadata = doc.getMap('metadata');
      
      metadata.set('createdAt', new Date().toISOString());
      metadata.set('jobId', jobId);
    }

    // Track connection
    if (!connections.has(jobId)) {
      connections.set(jobId, new Set());
    }
    connections.get(jobId)!.add(ws);

    // Send initial state
    const state = encodeStateAsUpdate(doc);
    ws.send(state);

    // Handle updates from client
    ws.on('message', (data: Buffer) => {
      try {
        const update = new Uint8Array(data);
        Y.applyUpdate(doc, update);
        
        // Broadcast to other clients
        broadcastUpdate(jobId, ws, update);
        
        logger.debug({ jobId, userId }, 'Yjs update applied and broadcasted');
      } catch (error) {
        logger.error({ error, jobId, userId }, 'Error applying Yjs update');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      const conns = connections.get(jobId);
      if (conns) {
        conns.delete(ws);
        if (conns.size === 0) {
          // Optionally clean up document when no connections remain
          // documents.delete(jobId);
          // connections.delete(jobId);
        }
      }
      logger.info({ jobId, userId }, 'Yjs WebSocket connection closed');
    });

    ws.on('error', (error) => {
      logger.error({ error, jobId, userId }, 'Yjs WebSocket error');
    });
  });
}

function broadcastUpdate(jobId: string, sender: WebSocket, update: Uint8Array): void {
  const conns = connections.get(jobId);
  if (!conns) return;

  for (const ws of conns) {
    if (ws !== sender && ws.readyState === WebSocket.OPEN) {
      ws.send(update);
    }
  }
}

function encodeStateAsUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function getDocument(jobId: string): Y.Doc | undefined {
  return documents.get(jobId);
}

export function getDocumentState(jobId: string): any | undefined {
  const doc = documents.get(jobId);
  if (!doc) return undefined;

  const milestones = doc.getMap('milestones');
  const metadata = doc.getMap('metadata');

  return {
    milestones: milestones.toJSON(),
    metadata: metadata.toJSON(),
  };
}

export function initializeDocumentFromDB(jobId: string, milestones: any[]): void {
  let doc = documents.get(jobId);
  if (!doc) {
    doc = new Y.Doc();
    documents.set(jobId, doc);
  }

  const milestonesMap = doc.getMap('milestones');
  const metadata = doc.getMap('metadata');

  // Clear existing data
  milestonesMap.clear();

  // Initialize from database
  milestones.forEach((milestone) => {
    const milestoneMap = new Y.Map();
    milestoneMap.set('id', milestone.id);
    milestoneMap.set('title', milestone.title);
    milestoneMap.set('description', milestone.description);
    milestoneMap.set('amount', milestone.amount);
    milestoneMap.set('status', milestone.status);
    milestoneMap.set('order', milestone.order);
    milestoneMap.set('dueDate', milestone.dueDate?.toISOString());
    milestonesMap.set(milestone.id, milestoneMap);
  });

  metadata.set('jobId', jobId);
  metadata.set('lastSynced', new Date().toISOString());

  logger.info({ jobId, milestoneCount: milestones.length }, 'Yjs document initialized from database');
}
