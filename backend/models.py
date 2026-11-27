"""
models.py — Data models and schemas for Aetheris.
# * SQLModel is commented out below as requested; standard Pydantic models are used
# * so the backend runs with zero database/sqlmodel package dependencies.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

# ===========================================================================
# SQLModel imports (COMMENTED OUT as requested)
# ===========================================================================
# from sqlmodel import SQLModel, Field, Relationship
#
# class UserPreference(SQLModel, table=True):
#     __tablename__ = "user_preferences"
#     id: Optional[int] = Field(default=None, primary_key=True)
#     user_id: int = Field(foreign_key="users.id", unique=True)
#     aqi_standard: str = Field(default="US_EPA")
#     unit_system: str = Field(default="metric")
#     notification_enabled: bool = Field(default=True)
#     alert_threshold_aqi: int = Field(default=100)
#     theme: str = Field(default="dark")
#     user: Optional["User"] = Relationship(back_populates="preferences")
#
# class SavedLocation(SQLModel, table=True):
#     __tablename__ = "saved_locations"
#     id: Optional[int] = Field(default=None, primary_key=True)
#     user_id: int = Field(foreign_key="users.id")
#     name: str = Field(max_length=100)
#     city: str = Field(max_length=100)
#     country: str = Field(default="", max_length=100)
#     latitude: float
#     longitude: float
#     is_default: bool = False
#     created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
#     user: Optional["User"] = Relationship(back_populates="saved_locations")
#
# class Alert(SQLModel, table=True):
#     __tablename__ = "alerts"
#     id: Optional[int] = Field(default=None, primary_key=True)
#     user_id: int = Field(foreign_key="users.id")
#     city: str = Field(max_length=100)
#     threshold_aqi: int = Field(default=100)
#     is_active: bool = True
#     last_triggered: Optional[datetime] = None
#     created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
#     user: Optional["User"] = Relationship(back_populates="alerts")
#
# class User(SQLModel, table=True):
#     __tablename__ = "users"
#     id: Optional[int] = Field(default=None, primary_key=True)
#     email: str = Field(index=True, unique=True, max_length=255)
#     username: str = Field(index=True, unique=True, max_length=50)
#     hashed_password: str
#     is_active: bool = True
#     is_verified: bool = False
#     created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
#     updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
#     preferences: Optional[UserPreference] = Relationship(back_populates="user")
#     saved_locations: List[SavedLocation] = Relationship(back_populates="user")
#     alerts: List[Alert] = Relationship(back_populates="user")
#
# class AQIHistory(SQLModel, table=True):
#     __tablename__ = "aqi_history"
#     id: Optional[int] = Field(default=None, primary_key=True)
#     city: str = Field(index=True, max_length=100)
#     latitude: float
#     longitude: float
#     aqi: int
#     pm25: Optional[float] = None
#     pm10: Optional[float] = None
#     o3: Optional[float] = None
#     no2: Optional[float] = None
#     so2: Optional[float] = None
#     co: Optional[float] = None
#     trapping_ceiling_msl: Optional[int] = None
#     stagnation_shear: Optional[float] = None
#     speciation_biomass_pct: Optional[int] = None
#     speciation_mobile_pct: Optional[int] = None
#     predicted_flush_hours: Optional[float] = None
#     bench_ridge_aqi: Optional[int] = None
#     source: str = Field(default="open-meteo")
#     recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ===========================================================================
# Pydantic imports (COMMENTED OUT as requested; zero external dependencies)
# ===========================================================================
# from pydantic import BaseModel, Field

# Pure Python data model foundation with zero external dependencies:
class BaseModel:
    """Pure Python base model providing standard dict/dump methods."""
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
    def dict(self, *args, **kwargs):
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}
    def model_dump(self, *args, **kwargs):
        return self.dict()

def Field(default=None, default_factory=None, **kwargs):
    """Pure Python field default helper."""
    if default_factory is not None:
        return default_factory()
    return default

# Alias BaseModel so all existing endpoints referencing SQLModel continue seamlessly
SQLModel = BaseModel


# ---------------------------------------------------------------------------
# Models (Pure Pydantic — Zero SQLModel dependency)
# ---------------------------------------------------------------------------

class UserPreference(BaseModel):
    id: Optional[int] = None
    user_id: int = 1
    aqi_standard: str = "US_EPA"
    unit_system: str = "metric"
    notification_enabled: bool = True
    alert_threshold_aqi: int = 100
    theme: str = "dark"


class SavedLocation(BaseModel):
    id: Optional[int] = None
    user_id: int = 1
    name: str
    city: str
    country: str = ""
    latitude: float
    longitude: float
    is_default: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Alert(BaseModel):
    id: Optional[int] = None
    user_id: int = 1
    city: str
    threshold_aqi: int = 100
    is_active: bool = True
    last_triggered: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class User(BaseModel):
    id: Optional[int] = None
    email: str
    username: str
    hashed_password: str
    is_active: bool = True
    is_verified: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AQIHistory(BaseModel):
    id: Optional[int] = None
    city: str
    latitude: float
    longitude: float
    aqi: int
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    o3: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None
    trapping_ceiling_msl: Optional[int] = None
    stagnation_shear: Optional[float] = None
    speciation_biomass_pct: Optional[int] = None
    speciation_mobile_pct: Optional[int] = None
    predicted_flush_hours: Optional[float] = None
    bench_ridge_aqi: Optional[int] = None
    source: str = "open-meteo"
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class UserRegisterRequest(BaseModel):
    email: str
    username: str
    password: str


class UserLoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class SavedLocationCreate(BaseModel):
    name: str
    city: str
    country: str = ""
    latitude: float
    longitude: float
    is_default: bool = False


class AlertCreate(BaseModel):
    city: str
    threshold_aqi: int = 100


class AIAnalyzeRequest(BaseModel):
    city: str
    aqi: int
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    o3: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None
    extra_context: Optional[str] = None


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------

class UserPublic(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AQICurrentResponse(BaseModel):
    city: str
    latitude: float
    longitude: float
    aqi: int
    aqi_category: str
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    o3: Optional[float] = None
    no2: Optional[float] = None
    so2: Optional[float] = None
    co: Optional[float] = None
    trapping_ceiling_msl: Optional[int] = None
    stagnation_shear: Optional[float] = None
    speciation_biomass_pct: Optional[int] = None
    speciation_mobile_pct: Optional[int] = None
    predicted_flush_hours: Optional[float] = None
    bench_ridge_aqi: Optional[int] = None
    source: str
    recorded_at: str


class ForecastPoint(BaseModel):
    time: str
    aqi: Optional[int] = None
    pm25: Optional[float] = None
    pm10: Optional[float] = None
    boundary_layer_height_m: Optional[int] = None
    wind_speed_mps: Optional[float] = None


class AQIForecastResponse(BaseModel):
    city: str
    latitude: float
    longitude: float
    forecast: List[ForecastPoint]


class InversionProfileResponse(BaseModel):
    coordinates: Dict[str, float]
    model: str
    confidence_pct: float
    current_trapping_ceiling_msl: int
    diurnal_phases: Dict[str, Any]
    timeline_72h: List[Dict[str, Any]] = []


class RouteDetail(BaseModel):
    name: str
    risk_level: str
    altitude_msl: int
    mean_pm25_ugm3: float
    drive_time_min: int
    inhaled_dose_ug: float
    cabin_directive: str
    reduction_pct: Optional[int] = None


class CorridorsResponse(BaseModel):
    route_a_valley_floor: RouteDetail
    route_b_elevated_bench: RouteDetail
    cabin_safety_protocol: Dict[str, str]


class CommunityStation(BaseModel):
    id: str
    name: str
    zone: str
    status: str
    pm25_ugm3: float
    aqi: int
    diagnostic: str
    action: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class StationsResponse(BaseModel):
    active_sensors_online: int
    stations: List[CommunityStation]


class AIAnalyzeResponse(BaseModel):
    city: str
    aqi: int
    summary: str
    health_advice: str
    recommendations: List[str]
    model_used: str
