from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. DATABASE_URL must be a low-privilege
    (non service-role) Postgres role so RLS is actually enforced per request
    — see app/core/db.py and docs/ARCHITECTURE.md."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str
    supabase_jwt_secret: str | None = None
    jwt_algorithm: str = "HS256"
    jwt_audience: str = "authenticated"

    lock_timeout_ms: int = 5_000
    statement_timeout_ms: int = 30_000

    cors_origins: str = ""


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Deferred and cached — never called at module import time. Importing
    app.core.config (transitively: app.core.db, app.core.auth, any route
    module) must succeed with no environment configured at all so route
    modules can be collected for OpenAPI generation, tooling and test
    discovery without live credentials."""
    return Settings()  # type: ignore[call-arg]
