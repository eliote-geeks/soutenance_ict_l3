"""
NetSentinel Backend API Entry Point
Exposes the FastAPI app for uvicorn to run
"""
from backend.server import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
