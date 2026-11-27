"""
main.py — FastAPI application entry point for Aetheris.
# * Connects database, routers, CORS middleware, and rate limiting.
"""

from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# * Internal imports
from database import create_db_and_tables
from routers.auth import router as auth_router
from routers.air_quality import router as aq_router
from routers.ai import router as ai_router

load_dotenv()

# * Rate limiter setup (60 requests per minute default)
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # * Startup: initialize SQLite database tables
    create_db_and_tables()
    yield
    # * Shutdown: cleanup if needed


app = FastAPI(
    title="Aetheris API",
    description="High-performance backend for real-time air quality telemetry, atmospheric forecasts, and AI navigation.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# * Attach rate limiter state & error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# * Configure CORS for frontend access
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "*",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# * Register API Routers
app.include_router(auth_router)
app.include_router(aq_router)
app.include_router(ai_router)


@app.get("/", tags=["Health"])
def root():
    # * Root status and discovery
    return {
        "app": "Aetheris CleanBreathe AI Navigator API",
        "status": "online",
        "version": "1.0.0",
        "documentation": "/docs",
        "endpoints": {
            "auth": "/auth",
            "air_quality": "/aq",
            "ai": "/ai",
        },
    }


@app.get("/health", tags=["Health"])
def health_check():
    # * Simple health probe
    return {"status": "healthy", "service": "aetheris-backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
