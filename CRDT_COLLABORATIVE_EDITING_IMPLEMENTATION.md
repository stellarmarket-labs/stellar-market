# CRDT-Based Real-Time Collaborative Editing Implementation

## Overview
This implementation adds Yjs-based CRDT (Conflict-free Replicated Data Type) collaborative editing to prevent milestone negotiation from overwriting concurrent edits.

## Problem Solved
Previously, when both client and freelancer edited milestone details simultaneously, the last write would win, potentially overwriting the other person's changes. This implementation uses CRDTs to automatically merge concurrent edits without conflicts.

## Changes Made

### Backend Changes

#### 1. Dependencies Added (`backend/package.json`)
- `yjs@^13.6.18` - CRDT implementation
- `y-websocket@^2.0.4` - WebSocket provider for Yjs
- `ws@^8.18.0` - WebSocket server
- `@types/ws@^8.5.13` - TypeScript types

#### 2. Yjs WebSocket Server (`backend/src/socket/yjsServer.ts`)
- Manages Yjs documents per job ID
- Handles WebSocket connections for real-time synchronization
- Broadcasts updates to all connected clients
- Provides document initialization from database
- Exports functions for document management

#### 3. Server Integration (`backend/src/index.ts`)
- Added WebSocket server upgrade handler for `/yjs` endpoint
- Initialized Yjs server with WebSocket server
- Handles WebSocket connections separately from Socket.IO

#### 4. Milestone Routes Update (`backend/src/routes/milestone.routes.ts`)
- Initializes Yjs documents when milestones are fetched
- Merges CRDT changes with database updates on milestone updates
- Prevents data loss from concurrent edits

### Frontend Changes

#### 1. Dependencies Added (`frontend/package.json`)
- `yjs@^13.6.18` - CRDT implementation
- `y-websocket@^2.0.4` - WebSocket provider for Yjs

#### 2. Yjs Context (`frontend/src/context/YjsContext.tsx`)
- Provides Yjs document and WebSocket provider to React components
- Manages connection status
- Exposes update and get functions for milestones
- Handles document lifecycle (connect/disconnect)

#### 3. Collaborative Milestones Hook (`frontend/src/hooks/useCollaborativeMilestones.ts`)
- Syncs Yjs changes to local React state
- Provides update functions for milestone fields
- Indicates collaborative editing status
- Initializes Yjs document with initial milestone data

#### 4. Job Detail Client Update (`frontend/src/app/jobs/[id]/JobDetailClient.tsx`)
- Wrapped with YjsProvider for collaborative editing
- Integrated collaborative milestones hook
- Displays collaborative editing status indicator
- Updates CRDT document on milestone status changes
- Uses collaborative milestones when available

## How It Works

1. **Initialization**: When a job page loads, the frontend connects to the Yjs WebSocket server with the job ID
2. **Document Sync**: The server initializes a Yjs document with the current milestone data from the database
3. **Real-Time Updates**: When either client or freelancer edits milestone data, changes are sent to the Yjs document
4. **CRDT Merge**: Yjs automatically merges concurrent edits using CRDT algorithms, preventing conflicts
5. **Broadcast**: Changes are broadcast to all connected clients in real-time
6. **Database Sync**: When milestone updates are saved via API, the backend merges CRDT changes with the database

## Installation Required

Before running the application, install the new dependencies:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## Usage

The collaborative editing is automatic. When both client and freelancer are viewing the same job page:
- A green indicator shows "Collaborative editing active"
- Changes made by either party are synced in real-time
- Concurrent edits are merged automatically without data loss

## Testing

To test collaborative editing:
1. Open the same job page in two different browsers (or incognito windows)
2. Log in as client in one, freelancer in the other
3. Make simultaneous edits to milestone fields
4. Verify that both changes are preserved and merged correctly

## Technical Details

- **CRDT Type**: Yjs uses Y.Map for milestone data structure
- **WebSocket Protocol**: Custom WebSocket server on `/yjs` endpoint
- **Document Scope**: One Yjs document per job ID
- **Conflict Resolution**: Automatic through Yjs CRDT algorithms
- **Fallback**: If WebSocket connection fails, falls back to REST API

## Files Changed

### Backend
- `backend/package.json` - Added Yjs dependencies
- `backend/src/index.ts` - Added WebSocket server integration
- `backend/src/socket/yjsServer.ts` - New file: Yjs WebSocket server
- `backend/src/routes/milestone.routes.ts` - Added CRDT merge logic

### Frontend
- `frontend/package.json` - Added Yjs dependencies
- `frontend/src/context/YjsContext.tsx` - New file: Yjs React context
- `frontend/src/hooks/useCollaborativeMilestones.ts` - New file: Collaborative editing hook
- `frontend/src/app/jobs/[id]/JobDetailClient.tsx` - Integrated collaborative editing

## Notes

- The implementation is backward compatible with existing functionality
- If WebSocket connection fails, the system falls back to REST API
- The collaborative editing only activates when both parties are viewing the same job
- All milestone fields (title, description, amount, status, dueDate) are synchronized
