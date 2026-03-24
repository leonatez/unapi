from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "API Contract Intelligence Platform"
    debug: bool = False

    # Supabase
    supabase_url: str
    supabase_key: str

    # Gemini
    gemini_api_key: str
    gemini_model: str = "gemini-3-flash-preview"

    # Upload
    upload_dir: str = "/tmp/unapi_uploads"
    max_upload_mb: int = 50

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
