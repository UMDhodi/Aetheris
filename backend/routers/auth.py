"""
routers/auth.py — Authentication endpoints for Aetheris.
# * SQLModel commented out as requested. Standard dict/SQLite storage.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Cookie, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ===========================================================================
# SQLModel imports (COMMENTED OUT as requested)
# ===========================================================================
# from sqlmodel import Session, select

try:
    from database import get_session
    from models import (
        User,
        UserPreference,
        UserRegisterRequest,
        UserLoginRequest,
        RefreshRequest,
        TokenResponse,
        UserPublic,
    )
    from auth import (
        hash_password,
        verify_password,
        create_access_token,
        create_refresh_token,
        decode_token,
        get_subject,
    )
except ImportError:
    from backend.database import get_session
    from backend.models import (
        User,
        UserPreference,
        UserRegisterRequest,
        UserLoginRequest,
        RefreshRequest,
        TokenResponse,
        UserPublic,
    )
    from backend.auth import (
        hash_password,
        verify_password,
        create_access_token,
        create_refresh_token,
        decode_token,
        get_subject,
    )

router = APIRouter(prefix="/auth", tags=["Authentication"])

bearer_scheme = HTTPBearer(auto_error=False)

# Fixed credentials for admin access
ADMIN_USER = {
    "id": 1,
    "email": "admin@aetheris.ai",
    "username": "admin",
    "hashed_password": hash_password("admin"),
    "is_active": True,
    "created_at": datetime.now(timezone.utc),
}


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLoginRequest, response: Response):
    """
    Authenticate user credentials.
    Supports fixed admin/admin and returns JWT session tokens.
    """
    username_or_email = credentials.email.strip()
    is_admin = (
        (username_or_email.lower() in ["admin", "admin@aetheris.ai"])
        and credentials.password == "admin"
    )

    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Use admin / admin to authenticate.",
        )

    access_token = create_access_token(data={"sub": ADMIN_USER["email"]})
    refresh_token = create_refresh_token(data={"sub": ADMIN_USER["email"]})

    response.set_cookie(
        key="aetheris_refresh",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=7 * 24 * 3600,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest):
    """
    # TODO: Self-service registration is currently disabled for security audit.
    # Re-enable self-service registration when Auth0 / multi-tenant database is provisioned.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Registration is disabled. Please login with existing administrator credentials (admin / admin).",
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(payload: RefreshRequest):
    """Exchange a valid refresh token for a new access token."""
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    sub = decoded.get("sub")
    new_access = create_access_token(data={"sub": sub})
    new_refresh = create_refresh_token(data={"sub": sub})

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
    )


@router.get("/me", response_model=UserPublic)
async def get_me(token: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)]):
    """Return the profile of the current authenticated user."""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return UserPublic(
        id=1,
        email="admin@aetheris.ai",
        username="admin",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
