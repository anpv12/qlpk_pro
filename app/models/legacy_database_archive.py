from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base


class LegacyDatabaseArchive(Base):
    __tablename__ = "legacy_database_archive"
    __table_args__ = (
        UniqueConstraint("source_table", "source_pk", name="uq_legacy_database_archive_source"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_table = Column(String(100), nullable=False, index=True)
    source_pk = Column(String(100), nullable=False)
    legacy_fields = Column(JSONB, nullable=False, default=dict)
    notes = Column(Text, nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

