"""
WebSocket Router - Real-time event broadcasting
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List, Dict
import json
import asyncio
from datetime import datetime

router = APIRouter()

class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.message_queue: List[Dict] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Send any queued messages
        for msg in self.message_queue:
            try:
                await websocket.send_json(msg)
            except:
                pass
        self.message_queue.clear()
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast(self, message: Dict):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        
        # Remove disconnected connections
        for connection in disconnected:
            self.disconnect(connection)
    
    async def send_personal_message(self, message: Dict, websocket: WebSocket):
        """Send message to specific client"""
        try:
            await websocket.send_json(message)
        except:
            self.disconnect(websocket)

# Global connection manager
manager = ConnectionManager()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        # Send initial connection message
        await manager.send_personal_message({
            "type": "connected",
            "message": "WebSocket connected",
            "timestamp": datetime.now().isoformat()
        }, websocket)
        
        # Keep connection alive and listen for messages
        while True:
            try:
                # Wait for client message (ping/pong or commands)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await manager.send_personal_message({
                            "type": "pong",
                            "timestamp": datetime.now().isoformat()
                        }, websocket)
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # Send heartbeat
                await manager.send_personal_message({
                    "type": "heartbeat",
                    "timestamp": datetime.now().isoformat()
                }, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def broadcast_event(event_type: str, data: Dict = None):
    """Helper function to broadcast events"""
    try:
        await manager.broadcast({
            "type": event_type,
            "data": data or {},
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        print(f"Error broadcasting event: {e}")

# Export manager for use in other modules
__all__ = ["router", "manager", "broadcast_event"]

