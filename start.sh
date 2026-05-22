#!/bin/bash
# NetSentinel Project Startup Script
# Starts both backend and frontend services

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "🚀 NetSentinel Startup"
echo "=================================="
echo "Project Directory: $PROJECT_DIR"
echo ""

# Check if Elasticsearch is running
echo "📊 Checking Elasticsearch..."
if curl -k -s https://localhost:9200 -u elastic:q-QXPX-bI=QucIV-isIo > /dev/null 2>&1; then
    echo "✓ Elasticsearch is running on https://localhost:9200"
else
    echo "⚠ Elasticsearch not responding at https://localhost:9200"
fi

echo ""
echo "Starting services..."
echo "=================================="

# Start backend in background
echo "1️⃣  Starting Backend (FastAPI on port 8010)..."
cd "$PROJECT_DIR"
$PROJECT_DIR/.venv/bin/uvicorn app:app --host 0.0.0.0 --port 8010 --reload > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"
sleep 2

# Start frontend in background
echo ""
echo "2️⃣  Starting Frontend (React on port 3000)..."
cd "$FRONTEND_DIR"
npm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
sleep 3

echo ""
echo "=================================="
echo "✅ Services Started!"
echo "=================================="
echo ""
echo "📱 Frontend:  http://localhost:3000"
echo "🔌 Backend:   http://localhost:8010"
echo "📊 API Docs:  http://localhost:8010/docs"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/backend.log"
echo "  Frontend: tail -f /tmp/frontend.log"
echo ""
echo "To stop services:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop, or run: kill $BACKEND_PID $FRONTEND_PID"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
