import pytest
from app.services.location_intelligence_service import LocationNormalizer, ConfidenceEngine

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
