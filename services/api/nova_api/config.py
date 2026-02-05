"""
Configuration management using Pydantic Settings.
"""
import os
from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # Application
    app_name: str = "Nova Hub"
    app_version: str = "0.1.0"
    debug: bool = False
    
    # Mode: nodocker (sqlite) or docker (postgres)
    nova_mode: str = "nodocker"
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./data/nova.db"
    
    # Security
    secret_key: str = "dev-secret-key-change-in-production"
    session_expire_hours: int = 24
    max_login_attempts: int = 5
    lockout_minutes: int = 15
    
    # Governance
    nova_allow_real_actions: bool = False
    
    # CORS
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    # Rate limiting
    rate_limit_auth_per_minute: int = 10
    
    # Ports
    api_port: int = 8000
    web_port: int = 5173
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url.lower()
    
    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def detect_mode() -> str:
    """
    Detect which mode to run in.
    Priority: env NOVA_MODE -> auto-detect docker -> nodocker
    """
    env_mode = os.environ.get("NOVA_MODE", "").lower()
    if env_mode in ("docker", "nodocker"):
        return env_mode
    
    # Auto-detect: check if Docker is running
    try:
        import subprocess
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5
        )
        if result.returncode == 0:
            return "docker"
    except Exception:
        pass
    
    return "nodocker"
