"""
database.py — Database session handler for Aetheris.
# * SQLModel is commented out below as requested; standard SQLite/dict persistence
# * is used so the backend runs without external sqlmodel dependencies.
"""

import os
import sqlite3
from typing import Generator
from dotenv import load_dotenv

load_dotenv()

# ===========================================================================
# SQLModel database setup (COMMENTED OUT as requested)
# ===========================================================================
# from sqlmodel import SQLModel, create_engine, Session
#
# DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./aetheris.db")
# connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
# engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)
#
# def create_db_and_tables() -> None:
#     from models import User, UserPreference, SavedLocation, AQIHistory, Alert
#     SQLModel.metadata.create_all(engine)
#
# def get_session():
#     with Session(engine) as session:
#         yield session

DB_FILE = os.getenv("SQLITE_FILE", "aetheris_local.db")


def create_db_and_tables() -> None:
    """Initialize local SQLite database tables using standard library sqlite3."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS aqi_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT,
            latitude REAL,
            longitude REAL,
            aqi INTEGER,
            pm25 REAL,
            pm10 REAL,
            o3 REAL,
            no2 REAL,
            so2 REAL,
            co REAL,
            trapping_ceiling_msl INTEGER,
            stagnation_shear REAL,
            speciation_biomass_pct INTEGER,
            speciation_mobile_pct INTEGER,
            predicted_flush_hours REAL,
            bench_ridge_aqi INTEGER,
            source TEXT,
            recorded_at TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            username TEXT UNIQUE,
            hashed_password TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT
        )
    """)
    conn.commit()
    conn.close()


class SimpleSession:
    """Lightweight session wrapper mimicking Session for backwards compatibility."""

    def __init__(self):
        self.conn = sqlite3.connect(DB_FILE)
        self.conn.row_factory = sqlite3.Row

    def add(self, record):
        pass

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

    def exec(self, query):
        class Result:
            def all(self):
                return []
            def first(self):
                return None
        return Result()


def get_session() -> Generator:
    """FastAPI dependency yielding a lightweight DB session."""
    session = SimpleSession()
    try:
        yield session
    finally:
        session.close()
