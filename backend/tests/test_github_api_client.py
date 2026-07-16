import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.github_api_client import GitHubAPIClient, RateLimitExceeded

@pytest.fixture
def mock_httpx_client():
    with patch("httpx.AsyncClient") as mock:
        yield mock.return_value

@pytest.mark.asyncio
async def test_github_api_client_auth():
    client = GitHubAPIClient(token="test_token")
    assert client.client.headers["Authorization"] == "token test_token"

@pytest.mark.asyncio
async def test_handle_rate_limit_ok(mock_httpx_client):
    client = GitHubAPIClient(token="test_token")
    req = httpx.Request("GET", "http://test.com")
    response = httpx.Response(200, headers={"X-RateLimit-Remaining": "4999", "X-RateLimit-Reset": "1234567890"}, request=req)
    
    await client._handle_rate_limit(response)
    assert client.rate_limit_remaining == 4999
    assert client.rate_limit_reset == 1234567890

@pytest.mark.asyncio
async def test_handle_rate_limit_exceeded(mock_httpx_client):
    client = GitHubAPIClient(token="test_token")
    req = httpx.Request("GET", "http://test.com")
    response = httpx.Response(403, headers={"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": "0"}, request=req)
    
    with pytest.raises(RateLimitExceeded):
        await client._handle_rate_limit(response)

@pytest.mark.asyncio
async def test_paginate(mock_httpx_client):
    client = GitHubAPIClient(token="test_token")
    req = httpx.Request("GET", "http://test.com")
    
    # Mock first response
    resp1 = MagicMock(spec=httpx.Response)
    resp1.json.return_value = [{"id": 1}]
    resp1.links = {"next": {"url": "http://test.com/page2"}}
    
    # Mock second response
    resp2 = MagicMock(spec=httpx.Response)
    resp2.json.return_value = [{"id": 2}]
    resp2.links = {}
    
    # Mock the request method instead of httpx directly
    with patch.object(client, "request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [resp1, resp2]
        
        items = []
        async for item in client.paginate("http://test.com"):
            items.append(item)
            
        assert len(items) == 2
        assert items[0]["id"] == 1
        assert items[1]["id"] == 2

@pytest.mark.asyncio
async def test_get_user_etag(mock_httpx_client):
    client = GitHubAPIClient(token="test_token")
    req = httpx.Request("GET", "http://test.com")
    
    # Mock a 304 response
    resp = httpx.Response(304, headers={"X-RateLimit-Remaining": "5000"}, request=req)
    
    with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = resp
        
        user = await client.get_user("test_user", etag="W/123")
        
        assert user["_status"] == 304
        mock_get.assert_called_once()
        args, kwargs = mock_get.call_args
        assert "If-None-Match" in kwargs["headers"]
        assert kwargs["headers"]["If-None-Match"] == "W/123"
