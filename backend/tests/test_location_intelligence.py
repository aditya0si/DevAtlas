import pytest

from app.services.location_intelligence_service import ConfidenceEngine, LocationNormalizer


def test_location_normalizer():
    # Test valid aliases
    assert LocationNormalizer.normalize("bangalore, india").normalized == "Bengaluru"
    assert LocationNormalizer.normalize("  new delhi  ").normalized == "New Delhi"

    # Test capitalisation fallback
    assert LocationNormalizer.normalize("san francisco, CA").normalized == "San Francisco, Ca"

    # Test empty or none
    assert LocationNormalizer.normalize(None).normalized is None
    assert LocationNormalizer.normalize("").normalized is None

def test_confidence_engine():
    assert ConfidenceEngine.calculate({"address": {"city": "Paris"}}) == 99
    assert ConfidenceEngine.calculate({"address": {"town": "Some Town"}}) == 99
    assert ConfidenceEngine.calculate({"address": {"state": "California"}}) == 90
    assert ConfidenceEngine.calculate({"address": {"country": "France"}}) == 65
    assert ConfidenceEngine.calculate({"address": {"unknown": "Place"}}) == 20
    assert ConfidenceEngine.calculate(None) == 0


@pytest.mark.asyncio
async def test_update_repository_geom_uses_parameterized_coordinates():
    """Geometry updates must pass coordinates as bind parameters, never
    interpolate them into the SQL string (SQL injection hardening)."""
    from unittest.mock import AsyncMock

    from app.repositories.location_repository import LocationRepository

    executed = []

    class FakeUser:
        login = "alice"
        longitude = 12.1025
        latitude = 28.7042

    class RecordingDB:
        async def execute(self, stmt, params=None):
            executed.append((str(stmt), params))
            return None

    repo = LocationRepository(RecordingDB())
    repo.get_github_user = AsyncMock(return_value=FakeUser())

    await repo.update_repository_geom_for_user("alice")

    assert executed, "expected an UPDATE statement"
    sql, params = executed[0]
    assert "ST_MakePoint" in sql
    # Coordinates must be bound parameters, not inlined literals
    assert ":longitude" in sql and ":latitude" in sql
    assert "12.1025" not in sql and "28.7042" not in sql
    assert params["longitude"] == 12.1025
    assert params["latitude"] == 28.7042
    assert params["login"] == "alice"
